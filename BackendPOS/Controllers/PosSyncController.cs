using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Bson;
using MongoDB.Driver;

namespace BackendPOS.Controllers
{
    [ApiController]
    [Route("api/pos")]
    public class PosSyncController : ControllerBase
    {
        private readonly IMongoCollection<BsonDocument> _cuentasCol;
        private readonly IMongoCollection<BsonDocument> _tiendasCol;
        private readonly HashSet<string> _superUsers;
        private readonly string _superPass;
        private readonly TimeSpan _sessionTtl;

        private static readonly ConcurrentDictionary<string, Sesion> Sesiones = new();
        private static readonly object FallosLock = new();
        private static readonly Dictionary<string, Queue<DateTime>> Fallos = new();

        public PosSyncController(IConfiguration config)
        {
            var client = new MongoClient(config["MongoDB:ConnectionURI"]);
            var db = client.GetDatabase(config["MongoDB:DatabaseName"]);
            _cuentasCol = db.GetCollection<BsonDocument>("cuentas_maestras");
            _tiendasCol = db.GetCollection<BsonDocument>("datos_comercios");

            var users = config.GetSection("Auth:SuperAdminUsers").Get<string[]>()
                ?? new[] { "superadmin", "rdr2goty" };
            _superUsers = users
                .Where(u => !string.IsNullOrWhiteSpace(u))
                .Select(u => u.Trim().ToLowerInvariant())
                .ToHashSet();
            _superPass = config["Auth:SuperAdminPass"] ?? "admin2026";
            var hours = int.TryParse(config["Auth:SessionHours"], out var h) ? h : 14;
            _sessionTtl = TimeSpan.FromHours(Math.Clamp(hours, 1, 48));

            InicializarDatosPorDefectoAsync().Wait();
        }

        private async Task InicializarDatosPorDefectoAsync()
        {
            var doc = await _cuentasCol.Find(Builders<BsonDocument>.Filter.Eq("_id", "master")).FirstOrDefaultAsync();
            if (doc != null) return;

            var cuentaInicial = new BsonDocument
            {
                { "id", "tonys_default" },
                { "comercio", "Tony's Panchos" },
                { "rubro", "Gastronomía / Panchería" },
                { "titular", "Agustín Urtubía" },
                { "cuit", "" },
                { "tel", "" },
                { "dir", "San Fernando, Buenos Aires" },
                { "user", "agustin" },
                { "pass", HashPassword("1234") },
                { "activo", true },
                { "creado", DateTime.UtcNow.ToString("yyyy-MM-dd") }
            };

            var masterDoc = new BsonDocument
            {
                { "_id", "master" },
                { "data", new BsonArray { cuentaInicial } }
            };
            await _cuentasCol.InsertOneAsync(masterDoc);
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] JsonElement credenciales)
        {
            if (!credenciales.TryGetProperty("user", out var userEl) || !credenciales.TryGetProperty("pass", out var passEl))
                return BadRequest(new { error = "Faltan las credenciales." });

            string user = (userEl.GetString() ?? "").Trim();
            string pass = passEl.GetString() ?? "";
            if (user.Length == 0 || user.Length > 80 || pass.Length > 200)
                return Unauthorized(new { error = "Usuario o contraseña incorrectos." });

            var claveIntento = $"{HttpContext.Connection.RemoteIpAddress}|{user.ToLowerInvariant()}";
            if (Bloqueado(claveIntento))
                return StatusCode(429, new { error = "Demasiados intentos. Esperá 10 minutos e intentá de nuevo." });

            if (_superUsers.Contains(user.ToLowerInvariant()) && LentoIgual(pass, _superPass))
            {
                LimpiarFallos(claveIntento);
                var token = EmitirSesion(true, null, user);
                return Ok(new { success = true, isSuperAdmin = true, token });
            }

            var doc = await _cuentasCol.Find(Builders<BsonDocument>.Filter.Eq("_id", "master")).FirstOrDefaultAsync();
            if (doc != null && doc.Contains("data"))
            {
                var accounts = doc["data"].AsBsonArray;
                foreach (var item in accounts)
                {
                    var acc = item.AsBsonDocument;
                    var accUser = LeerTexto(acc, "user");
                    var accPass = LeerTexto(acc, "pass");
                    if (!accUser.Equals(user, StringComparison.OrdinalIgnoreCase) || !VerificarPassword(pass, accPass))
                        continue;

                    if (acc.Contains("activo") && !acc["activo"].IsBsonNull && acc["activo"].ToBoolean() == false)
                        return BadRequest(new { error = "Esta cuenta se encuentra suspendida." });

                    if (!EsHash(accPass))
                    {
                        acc["pass"] = HashPassword(pass);
                        await GuardarCuentas(accounts);
                    }

                    LimpiarFallos(claveIntento);
                    var token = EmitirSesion(false, LeerTexto(acc, "id"), accUser);
                    return Ok(new { success = true, isSuperAdmin = false, token, account = CuentaPublica(acc) });
                }
            }

            RegistrarFallo(claveIntento);
            return Unauthorized(new { error = "Usuario o contraseña incorrectos." });
        }

        [HttpGet("session")]
        public async Task<IActionResult> Session()
        {
            var sesion = LeerSesion();
            if (sesion == null) return Unauthorized(new { error = "Sesión vencida." });
            if (sesion.SuperAdmin) return Ok(new { success = true, isSuperAdmin = true });

            var acc = await BuscarCuenta(sesion.AccountId);
            if (acc == null) return Unauthorized(new { error = "La cuenta ya no existe." });
            if (acc.Contains("activo") && !acc["activo"].IsBsonNull && acc["activo"].ToBoolean() == false)
                return Unauthorized(new { error = "Esta cuenta se encuentra suspendida." });

            return Ok(new { success = true, isSuperAdmin = false, account = CuentaPublica(acc) });
        }

        [HttpPost("logout")]
        public IActionResult Logout()
        {
            var header = Request.Headers.Authorization.ToString();
            if (header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            {
                var token = header["Bearer ".Length..].Trim();
                Sesiones.TryRemove(token, out _);
            }
            return Ok(new { ok = true });
        }

        [HttpGet("accounts")]
        public async Task<IActionResult> GetAccounts()
        {
            if (ExigirSuper() == null) return Unauthorized(new { error = "No autorizado." });
            var accounts = await CuentasActuales();
            var pub = accounts.Select(x => CuentaPublica(x.AsBsonDocument)).ToList();
            return Ok(pub);
        }

        [HttpPost("accounts")]
        public async Task<IActionResult> SaveAccounts([FromBody] JsonElement body)
        {
            if (ExigirSuper() == null) return Unauthorized(new { error = "No autorizado." });
            if (body.ValueKind != JsonValueKind.Array)
                return BadRequest(new { error = "El listado de cuentas es inválido." });

            BsonArray incoming;
            try
            {
                incoming = MongoDB.Bson.Serialization.BsonSerializer.Deserialize<BsonArray>(body.GetRawText());
            }
            catch
            {
                return BadRequest(new { error = "No se pudieron leer las cuentas." });
            }

            var actuales = await CuentasActuales();
            var vistos = new HashSet<string>();
            var normalizadas = new BsonArray();

            foreach (var item in incoming)
            {
                if (!item.IsBsonDocument) continue;
                var acc = item.AsBsonDocument;
                var id = LeerTexto(acc, "id");
                var user = LeerTexto(acc, "user").Trim();
                var comercio = LeerTexto(acc, "comercio").Trim();
                if (id.Length == 0 || user.Length == 0 || comercio.Length == 0)
                    return BadRequest(new { error = "Cada cuenta necesita comercio, usuario e identificador." });
                if (_superUsers.Contains(user.ToLowerInvariant()))
                    return BadRequest(new { error = "Ese usuario está reservado para el administrador." });
                if (!vistos.Add(user.ToLowerInvariant()))
                    return BadRequest(new { error = "Hay dos comercios con el mismo usuario." });

                string pass;
                try
                {
                    pass = ResolverPass(acc, actuales);
                }
                catch (InvalidOperationException ex)
                {
                    return BadRequest(new { error = ex.Message });
                }

                var limpio = new BsonDocument
                {
                    { "id", id },
                    { "comercio", comercio },
                    { "rubro", LeerTexto(acc, "rubro") },
                    { "titular", LeerTexto(acc, "titular") },
                    { "cuit", LeerTexto(acc, "cuit") },
                    { "tel", LeerTexto(acc, "tel") },
                    { "dir", LeerTexto(acc, "dir") },
                    { "user", user },
                    { "pass", pass },
                    { "activo", !acc.Contains("activo") || acc["activo"].IsBsonNull || acc["activo"].ToBoolean() },
                    { "creado", string.IsNullOrWhiteSpace(LeerTexto(acc, "creado")) ? DateTime.UtcNow.ToString("yyyy-MM-dd") : LeerTexto(acc, "creado") }
                };

                var previo = actuales.FirstOrDefault(x => LeerTexto(x.AsBsonDocument, "id") == id)?.AsBsonDocument;
                if (previo != null && LeerTexto(previo, "pass") != pass)
                    CerrarSesionesDe(id);
                if (!limpio["activo"].ToBoolean())
                    CerrarSesionesDe(id);

                normalizadas.Add(limpio);
            }

            var idsNuevos = normalizadas.Select(x => LeerTexto(x.AsBsonDocument, "id")).ToHashSet();
            foreach (var viejo in actuales)
            {
                var viejoId = LeerTexto(viejo.AsBsonDocument, "id");
                if (!idsNuevos.Contains(viejoId)) CerrarSesionesDe(viejoId);
            }

            await GuardarCuentas(normalizadas);
            return Ok(new { ok = true });
        }

        [HttpGet("store/{accountId}")]
        public async Task<IActionResult> GetStore(string accountId)
        {
            if (!PuedeTienda(accountId)) return Unauthorized(new { error = "No autorizado." });
            var doc = await _tiendasCol.Find(Builders<BsonDocument>.Filter.Eq("_id", accountId)).FirstOrDefaultAsync();
            if (doc == null || !doc.Contains("store")) return NotFound();
            var store = doc["store"].AsBsonDocument;
            if (store.Contains("cfg") && store["cfg"].IsBsonDocument)
                store["cfg"].AsBsonDocument.Remove("pass");
            return Content(store.ToJson(), "application/json");
        }

        [HttpPost("store/{accountId}")]
        public async Task<IActionResult> SaveStore(string accountId, [FromBody] JsonElement body)
        {
            if (!PuedeTienda(accountId)) return Unauthorized(new { error = "No autorizado." });
            BsonDocument bsonDoc;
            try
            {
                bsonDoc = BsonDocument.Parse(body.GetRawText());
            }
            catch
            {
                return BadRequest(new { error = "Los datos del comercio no se pudieron leer." });
            }

            if (bsonDoc.Contains("cfg") && bsonDoc["cfg"].IsBsonDocument)
                bsonDoc["cfg"].AsBsonDocument.Remove("pass");

            var wrapper = new BsonDocument
            {
                { "_id", accountId },
                { "store", bsonDoc },
                { "ultimaActualizacion", DateTime.UtcNow }
            };
            await _tiendasCol.ReplaceOneAsync(
                Builders<BsonDocument>.Filter.Eq("_id", accountId),
                wrapper,
                new ReplaceOptions { IsUpsert = true }
            );
            return Ok(new { ok = true });
        }

        [HttpDelete("store/{accountId}")]
        public async Task<IActionResult> DeleteStore(string accountId)
        {
            if (ExigirSuper() == null) return Unauthorized(new { error = "No autorizado." });
            await _tiendasCol.DeleteOneAsync(Builders<BsonDocument>.Filter.Eq("_id", accountId));
            CerrarSesionesDe(accountId);
            return Ok(new { ok = true });
        }

        [HttpPost("profile")]
        public async Task<IActionResult> UpdateProfile([FromBody] JsonElement body)
        {
            var sesion = LeerSesion();
            if (sesion == null) return Unauthorized(new { error = "No autorizado." });

            var id = body.TryGetProperty("id", out var idEl) ? (idEl.GetString() ?? "") : "";
            if (!sesion.SuperAdmin && id != sesion.AccountId)
                return Unauthorized(new { error = "No autorizado." });
            if (sesion.SuperAdmin && string.IsNullOrWhiteSpace(id))
                return BadRequest(new { error = "Falta el comercio." });
            if (!sesion.SuperAdmin) id = sesion.AccountId ?? "";

            var accounts = await CuentasActuales();
            var acc = accounts.Select(x => x.AsBsonDocument).FirstOrDefault(x => LeerTexto(x, "id") == id);
            if (acc == null) return NotFound(new { error = "Comercio no encontrado." });

            if (body.TryGetProperty("comercio", out var comercio) && !string.IsNullOrWhiteSpace(comercio.GetString()))
                acc["comercio"] = comercio.GetString()!.Trim();
            if (body.TryGetProperty("tel", out var tel))
                acc["tel"] = tel.GetString() ?? "";
            if (body.TryGetProperty("dir", out var dir))
                acc["dir"] = dir.GetString() ?? "";

            await GuardarCuentas(accounts);
            return Ok(new { ok = true });
        }

        [HttpPost("password")]
        public async Task<IActionResult> ChangePassword([FromBody] JsonElement body)
        {
            var sesion = LeerSesion();
            if (sesion == null || sesion.SuperAdmin || string.IsNullOrEmpty(sesion.AccountId))
                return Unauthorized(new { error = "Cambiá esta clave desde el panel de comercios." });

            var actual = body.TryGetProperty("actual", out var a) ? a.GetString() ?? "" : "";
            var nueva = body.TryGetProperty("nueva", out var n) ? n.GetString() ?? "" : "";
            if (nueva.Length < 4 || nueva.Length > 200)
                return BadRequest(new { error = "La nueva contraseña necesita entre 4 y 200 caracteres." });

            var accounts = await CuentasActuales();
            var acc = accounts.Select(x => x.AsBsonDocument).FirstOrDefault(x => LeerTexto(x, "id") == sesion.AccountId);
            if (acc == null) return Unauthorized(new { error = "La cuenta ya no existe." });
            if (!VerificarPassword(actual, LeerTexto(acc, "pass")))
                return BadRequest(new { error = "La contraseña actual no coincide." });

            acc["pass"] = HashPassword(nueva);
            await GuardarCuentas(accounts);
            CerrarSesionesDe(sesion.AccountId);
            var token = EmitirSesion(false, sesion.AccountId, sesion.User);
            return Ok(new { ok = true, token });
        }

        private Sesion? ExigirSuper()
        {
            var sesion = LeerSesion();
            return sesion is { SuperAdmin: true } ? sesion : null;
        }

        private bool PuedeTienda(string accountId)
        {
            var sesion = LeerSesion();
            if (sesion == null) return false;
            return sesion.SuperAdmin || sesion.AccountId == accountId;
        }

        private Sesion? LeerSesion()
        {
            var header = Request.Headers.Authorization.ToString();
            if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return null;
            var token = header["Bearer ".Length..].Trim();
            if (!Sesiones.TryGetValue(token, out var sesion)) return null;
            if (sesion.Expira < DateTime.UtcNow)
            {
                Sesiones.TryRemove(token, out _);
                return null;
            }
            sesion.Expira = DateTime.UtcNow.Add(_sessionTtl);
            return sesion;
        }

        private string EmitirSesion(bool super, string? accountId, string user)
        {
            var token = NuevoToken();
            Sesiones[token] = new Sesion
            {
                SuperAdmin = super,
                AccountId = accountId,
                User = user,
                Expira = DateTime.UtcNow.Add(_sessionTtl)
            };
            return token;
        }

        private static void CerrarSesionesDe(string? accountId)
        {
            if (string.IsNullOrEmpty(accountId)) return;
            foreach (var kv in Sesiones)
            {
                if (kv.Value.AccountId == accountId)
                    Sesiones.TryRemove(kv.Key, out _);
            }
        }

        private async Task<BsonArray> CuentasActuales()
        {
            var doc = await _cuentasCol.Find(Builders<BsonDocument>.Filter.Eq("_id", "master")).FirstOrDefaultAsync();
            if (doc == null || !doc.Contains("data") || !doc["data"].IsBsonArray) return new BsonArray();
            return doc["data"].AsBsonArray;
        }

        private async Task<BsonDocument?> BuscarCuenta(string? id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            var accounts = await CuentasActuales();
            return accounts.Select(x => x.AsBsonDocument).FirstOrDefault(x => LeerTexto(x, "id") == id);
        }

        private async Task GuardarCuentas(BsonArray data)
        {
            var doc = new BsonDocument { { "_id", "master" }, { "data", data } };
            await _cuentasCol.ReplaceOneAsync(
                Builders<BsonDocument>.Filter.Eq("_id", "master"),
                doc,
                new ReplaceOptions { IsUpsert = true }
            );
        }

        private static string ResolverPass(BsonDocument incoming, BsonArray actuales)
        {
            var id = LeerTexto(incoming, "id");
            var pass = LeerTexto(incoming, "pass");
            var previo = actuales.FirstOrDefault(x => LeerTexto(x.AsBsonDocument, "id") == id)?.AsBsonDocument;
            var hashPrevio = previo == null ? "" : LeerTexto(previo, "pass");

            if (string.IsNullOrWhiteSpace(pass))
            {
                if (string.IsNullOrEmpty(hashPrevio))
                    throw new InvalidOperationException("La cuenta nueva necesita una contraseña.");
                return EsHash(hashPrevio) ? hashPrevio : HashPassword(hashPrevio);
            }

            if (pass.Length < 4)
                throw new InvalidOperationException("La contraseña necesita al menos 4 caracteres.");
            if (EsHash(pass)) return pass;
            return HashPassword(pass);
        }

        private static object CuentaPublica(BsonDocument acc)
        {
            var activo = !acc.Contains("activo") || acc["activo"].IsBsonNull || acc["activo"].ToBoolean();
            return new
            {
                id = LeerTexto(acc, "id"),
                comercio = LeerTexto(acc, "comercio"),
                rubro = LeerTexto(acc, "rubro"),
                titular = LeerTexto(acc, "titular"),
                cuit = LeerTexto(acc, "cuit"),
                tel = LeerTexto(acc, "tel"),
                dir = LeerTexto(acc, "dir"),
                user = LeerTexto(acc, "user"),
                activo,
                creado = LeerTexto(acc, "creado"),
                protegida = true
            };
        }

        private static string LeerTexto(BsonDocument doc, string key)
        {
            if (!doc.Contains(key) || doc[key].IsBsonNull) return "";
            return doc[key].ToString() ?? "";
        }

        private static bool EsHash(string stored) =>
            stored.StartsWith("pbkdf2$", StringComparison.Ordinal) && stored.Split('$').Length == 4;

        private static string HashPassword(string pass)
        {
            var salt = RandomNumberGenerator.GetBytes(16);
            var hash = Rfc2898DeriveBytes.Pbkdf2(pass, salt, 100_000, HashAlgorithmName.SHA256, 32);
            return $"pbkdf2$100000${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
        }

        private static bool VerificarPassword(string pass, string stored)
        {
            if (string.IsNullOrEmpty(stored)) return false;
            if (!EsHash(stored)) return LentoIgual(pass, stored);

            var parts = stored.Split('$');
            if (!int.TryParse(parts[1], out var iters) || iters < 10_000 || iters > 500_000) return false;
            try
            {
                var salt = Convert.FromBase64String(parts[2]);
                var expected = Convert.FromBase64String(parts[3]);
                var actual = Rfc2898DeriveBytes.Pbkdf2(pass, salt, iters, HashAlgorithmName.SHA256, expected.Length);
                return CryptographicOperations.FixedTimeEquals(actual, expected);
            }
            catch
            {
                return false;
            }
        }

        private static bool LentoIgual(string a, string b)
        {
            var aa = Encoding.UTF8.GetBytes(a);
            var bb = Encoding.UTF8.GetBytes(b);
            if (aa.Length != bb.Length)
            {
                CryptographicOperations.FixedTimeEquals(aa, aa);
                return false;
            }
            return CryptographicOperations.FixedTimeEquals(aa, bb);
        }

        private static bool Bloqueado(string clave)
        {
            lock (FallosLock)
            {
                if (!Fallos.TryGetValue(clave, out var q)) return false;
                var corte = DateTime.UtcNow.AddMinutes(-10);
                while (q.Count > 0 && q.Peek() < corte) q.Dequeue();
                return q.Count >= 8;
            }
        }

        private static void RegistrarFallo(string clave)
        {
            lock (FallosLock)
            {
                if (!Fallos.TryGetValue(clave, out var q))
                {
                    q = new Queue<DateTime>();
                    Fallos[clave] = q;
                }
                q.Enqueue(DateTime.UtcNow);
            }
        }

        private static void LimpiarFallos(string clave)
        {
            lock (FallosLock) Fallos.Remove(clave);
        }

        private static string NuevoToken()
        {
            var bytes = RandomNumberGenerator.GetBytes(32);
            return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        }

        private sealed class Sesion
        {
            public bool SuperAdmin { get; set; }
            public string? AccountId { get; set; }
            public string User { get; set; } = "";
            public DateTime Expira { get; set; }
        }
    }
}
