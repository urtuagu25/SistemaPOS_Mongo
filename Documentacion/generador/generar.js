const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..', 'Carpeta de campo');
fs.mkdirSync(OUT, { recursive: true });

const RED = '#b71c1c';
const REDD = '#7f0000';
const GOLD = '#ffb300';
const INK = '#1c1c1c';
const BODY = '#242424';
const MUTED = '#5c584f';
const LINE = '#e4dfd6';
const CREAM = '#fff8e6';
const SOFT = '#f6f3ee';
const W = 595.28;
const H = 841.89;
const L = 50;
const CW = W - L * 2;

function fit(widths) {
  const head = widths.slice(0, -1);
  const used = head.reduce((a, b) => a + b, 0);
  return head.concat([Math.round((CW - used) * 100) / 100]);
}

class Layout {
  constructor(doc, running) {
    this.doc = doc;
    this.running = running;
    this.page = 1;
    this.y = 70;
    this.toc = [];
    this.tocIndex = 1;
  }

  chrome() {
    const d = this.doc;
    d.save();
    d.rect(0, 0, W, 5).fill(RED);
    d.rect(0, 5, W, 2.5).fill(GOLD);
    d.font('Body').fontSize(8).fillColor(MUTED);
    d.text('KEDASI', L, 18, { lineBreak: false, characterSpacing: 0.6 });
    d.text(this.running, L, 18, { width: CW, align: 'right', lineBreak: false });
    d.rect(L, 32, CW, 0.7).fill(LINE);
    d.rect(0, H - 30, W, 30).fill('#fbfaf8');
    d.rect(0, H - 30, W, 0.7).fill(LINE);
    d.font('Body').fontSize(8).fillColor(MUTED);
    d.text('Uso interno  ·  noviembre 2026', L, H - 19, { lineBreak: false });
    d.font('Bold').fontSize(8).fillColor(RED);
    d.text(String(this.page).padStart(2, '0'), L, H - 19, { width: CW, align: 'right', lineBreak: false });
    d.restore();
  }

  next() {
    this.doc.addPage();
    this.page += 1;
    this.chrome();
    this.y = 68;
  }

  need(h) {
    if (this.y + h > H - 46) this.next();
  }

  h1(text) {
    this.need(58);
    this.toc.push({ text, page: this.page });
    const d = this.doc;
    const n = String(this.toc.length).padStart(2, '0');
    d.font('Bold').fontSize(9).fillColor(RED);
    d.text(n, L, this.y, { lineBreak: false, characterSpacing: 1 });
    this.y += 13;
    d.font('Bold').fontSize(15).fillColor(INK);
    const hh = d.heightOfString(text, { width: CW });
    d.text(text, L, this.y, { width: CW });
    this.y += hh + 5;
    d.rect(L, this.y, 32, 2.2).fill(RED);
    d.rect(L + 32, this.y, 16, 2.2).fill(GOLD);
    this.y += 14;
  }

  h2(text) {
    this.need(28);
    this.y += 4;
    const d = this.doc;
    d.font('Bold').fontSize(11.5).fillColor(REDD);
    const hh = d.heightOfString(text, { width: CW });
    d.text(text, L, this.y, { width: CW });
    this.y += hh + 6;
  }

  p(text) {
    const d = this.doc;
    d.font('Body').fontSize(10.5);
    const opt = { width: CW, lineGap: 3 };
    const hh = d.heightOfString(text, opt);
    this.need(hh);
    d.fillColor(BODY).text(text, L, this.y, opt);
    this.y += hh + 8;
  }

  bullets(items) {
    const d = this.doc;
    items.forEach((item) => {
      d.font('Body').fontSize(10.5);
      const opt = { width: CW - 16, lineGap: 2 };
      const hh = d.heightOfString(item, opt);
      this.need(hh + 2);
      d.circle(L + 3, this.y + 6, 2).fill(GOLD);
      d.fillColor(BODY).font('Body').fontSize(10.5);
      d.text(item, L + 14, this.y, opt);
      this.y += hh + 5;
    });
    this.y += 3;
  }

  note(text) {
    const d = this.doc;
    d.font('Body').fontSize(10);
    const inner = CW - 24;
    const opt = { width: inner, lineGap: 2 };
    const hh = d.heightOfString(text, opt);
    const box = hh + 16;
    this.need(box);
    d.save();
    d.rect(L, this.y, CW, box).fill(CREAM);
    d.rect(L, this.y, 3.5, box).fill(GOLD);
    d.fillColor(INK).text(text, L + 14, this.y + 8, opt);
    d.restore();
    this.y += box + 10;
  }

  kv(rows) {
    const d = this.doc;
    const lw = 158;
    rows.forEach((pair, i) => {
      d.font('Body').fontSize(10);
      const hLabel = d.font('Bold').fontSize(8.5).heightOfString(pair[0], { width: lw - 16 });
      const hVal = d.font('Body').fontSize(10).heightOfString(pair[1], { width: CW - lw - 16, lineGap: 1 });
      const rowH = Math.max(hLabel, hVal) + 12;
      this.need(rowH);
      if (i % 2 === 0) d.rect(L, this.y, CW, rowH).fill(SOFT);
      d.font('Bold').fontSize(8).fillColor(MUTED);
      d.text(pair[0].toUpperCase(), L + 8, this.y + 6, { width: lw - 14 });
      d.font('Body').fontSize(10).fillColor(INK);
      d.text(pair[1], L + lw, this.y + 5, { width: CW - lw - 10, lineGap: 1 });
      this.y += rowH;
    });
    this.y += 10;
  }

  table(headers, rows, widths) {
    const cols = fit(widths);
    const d = this.doc;
    const drawHeader = () => {
      this.need(24);
      d.rect(L, this.y, CW, 20).fill(RED);
      let x = L;
      d.font('Bold').fontSize(8).fillColor('#ffffff');
      headers.forEach((cell, i) => {
        d.text(String(cell), x + 6, this.y + 6, { width: cols[i] - 10, lineBreak: false });
        x += cols[i];
      });
      this.y += 20;
    };
    drawHeader();
    rows.forEach((row, ri) => {
      d.font('Body').fontSize(8.5);
      const heights = row.map((cell, i) =>
        d.heightOfString(String(cell), { width: cols[i] - 12, lineGap: 1 })
      );
      const rowH = Math.max(16, ...heights) + 10;
      if (this.y + rowH > H - 46) {
        this.next();
        drawHeader();
      }
      if (ri % 2 === 1) d.rect(L, this.y, CW, rowH).fill(SOFT);
      d.rect(L, this.y + rowH - 0.4, CW, 0.4).fill(LINE);
      let x = L;
      row.forEach((cell, i) => {
        d.font('Body').fontSize(8.5).fillColor(INK);
        d.text(String(cell), x + 6, this.y + 5, { width: cols[i] - 12, lineGap: 1 });
        x += cols[i];
      });
      this.y += rowH;
    });
    this.y += 10;
  }

  paintToc() {
    const d = this.doc;
    d.switchToPage(this.tocIndex);
    let y = 72;
    d.font('Bold').fontSize(9).fillColor(RED).text('00', L, y, { lineBreak: false, characterSpacing: 1 });
    y += 14;
    d.font('Bold').fontSize(15).fillColor(INK).text('Contenido', L, y);
    y += 22;
    d.rect(L, y, 32, 2.2).fill(RED);
    d.rect(L + 32, y, 16, 2.2).fill(GOLD);
    y += 20;
    this.toc.forEach((item, i) => {
      const n = String(i + 1).padStart(2, '0');
      const left = n + '    ' + item.text;
      const page = String(item.page).padStart(2, '0');
      d.font('Body').fontSize(11).fillColor(INK);
      d.text(left, L, y, { lineBreak: false });
      d.font('Bold').fontSize(11).fillColor(RED);
      d.text(page, L, y, { width: CW, align: 'right', lineBreak: false });
      const lw = d.font('Body').fontSize(11).widthOfString(left);
      const pw = d.font('Bold').fontSize(11).widthOfString(page);
      const x1 = L + lw + 10;
      const x2 = L + CW - pw - 10;
      if (x2 > x1 + 8) {
        d.save();
        d.strokeColor('#d9d3c8').lineWidth(0.7);
        d.moveTo(x1, y + 9).lineTo(x2, y + 9).stroke();
        d.restore();
      }
      y += 24;
    });
  }
}

function drawCover(doc, o) {
  doc.rect(0, 0, W, H).fill('#ffffff');
  doc.rect(0, 0, 14, H).fill(RED);
  doc.rect(14, 0, 6, H).fill(GOLD);
  doc.rect(0, 0, W, 8).fill(RED);

  doc.fillColor(RED).font('Bold').fontSize(11);
  doc.text(o.code, 48, 42, { characterSpacing: 1.4 });

  doc.fillColor(INK).font('Body').fontSize(11);
  doc.text('SISTEMA DE PUNTO DE VENTA GASTRONÓMICO', 48, 78, { characterSpacing: 0.8 });

  doc.fillColor(RED).font('Bold').fontSize(52);
  doc.text('KEDASI', 46, 102, { characterSpacing: 7 });

  doc.rect(48, 168, 86, 3).fill(RED);
  doc.rect(134, 168, 28, 3).fill(GOLD);

  doc.fillColor(INK).font('Bold').fontSize(20);
  doc.text(o.kind, 48, 188, { width: 460 });

  doc.fillColor(BODY).font('Body').fontSize(12);
  doc.text(o.lead, 48, 224, { width: 430, lineGap: 3 });

  const facts = o.facts || [];
  if (facts.length) {
    const boxW = 460 / facts.length;
    facts.forEach((f, i) => {
      const x = 48 + i * boxW;
      doc.font('Bold').fontSize(12).fillColor(RED);
      doc.text(f[0], x, 292, { width: boxW - 16, lineBreak: false });
      doc.font('Bold').fontSize(10).fillColor(INK);
      doc.text(f[1], x, 310, { width: boxW - 16 });
      doc.font('Body').fontSize(9).fillColor(MUTED);
      doc.text(f[2], x, 326, { width: boxW - 16 });
    });
  }

  let y = 368;
  doc.rect(48, y, 460, 0.8).fill(LINE);
  o.meta.forEach((pair) => {
    y += 8;
    doc.font('Body').fontSize(8.5).fillColor(MUTED);
    doc.text(pair[0].toUpperCase(), 48, y + 6, { width: 140 });
    doc.font('Body').fontSize(11).fillColor(INK);
    doc.text(pair[1], 196, y + 4, { width: 300 });
    y += 26;
    doc.rect(48, y, 460, 0.5).fill(LINE);
  });

  doc.rect(0, H - 46, W, 46).fill(RED);
  doc.rect(0, H - 52, W, 6).fill(GOLD);
  doc.fillColor('#ffffff').font('Body').fontSize(9);
  doc.text('Las claves de acceso no se imprimen en este documento.', 48, H - 28, { lineBreak: false });
}

function render(file, info, running, cover, body) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    bufferPages: true,
    info
  });
  doc.registerFont('Body', path.join(__dirname, 'fonts', 'LiberationSans-Regular.ttf'));
  doc.registerFont('Bold', path.join(__dirname, 'fonts', 'LiberationSans-Bold.ttf'));
  const stream = fs.createWriteStream(file);
  doc.pipe(stream);
  const lay = new Layout(doc, running);
  drawCover(doc, cover);
  doc.addPage();
  lay.page = 2;
  lay.chrome();
  lay.tocIndex = 1;
  doc.addPage();
  lay.page = 3;
  lay.chrome();
  lay.y = 68;
  body(lay);
  lay.paintToc();
  doc.end();
  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(file));
    stream.on('error', reject);
  });
}

const META = [
  ['Responsable', 'Agustín Urtubía'],
  ['Lugar', 'San Fernando, Buenos Aires'],
  ['Fecha', '17 de noviembre de 2026'],
  ['Versión', '1.0'],
  ['Estado', 'Sistema en operación local']
];

function carpeta(lay) {
  lay.h1('Para qué es esta carpeta');
  lay.p('Esta carpeta es el documento de campo de KEDASI. Sirve para atender el local, revisar un turno y entender cómo está armado el sistema, sin tener que leer el código. Describe el producto tal como quedó construido: la atención, la cocina, la caja, el stock, los proveedores y el alta de nuevos negocios.');
  lay.p('KEDASI es un punto de venta gastronómico. Nació para el circuito de un local de panchos y quedó preparado para sumar otros comercios, cada uno con su usuario, su stock y su caja. Se usa desde el navegador. Los datos viven en MongoDB, en la misma máquina del servidor.');
  lay.note('La base conserva el nombre de origen TonyPanchosPOS_DB. El nombre con el que se presenta el sistema, en la pantalla de ingreso y en la solapa del navegador, es KEDASI.');

  lay.h1('Ficha del sistema');
  lay.kv([
    ['Nombre', 'KEDASI'],
    ['Tipo', 'Punto de venta gastronómico, con varios negocios'],
    ['Interfaz', 'Una sola página web, HTML, CSS y JavaScript'],
    ['Servidor', 'ASP.NET Core 10, archivo estático más API'],
    ['Datos', 'MongoDB  ·  base TonyPanchosPOS_DB'],
    ['Dirección local', 'http://localhost:5126'],
    ['Colección de cuentas', 'cuentas_maestras'],
    ['Colección de locales', 'datos_comercios'],
    ['Paleta', 'Rojo #b71c1c, blanco y amarillo #ffb300']
  ]);

  lay.h1('Problema y objetivos');
  lay.h2('El problema');
  lay.p('En un servicio de comida la comanda, la cocina, el cobro y el cajón tienen que coincidir. Si la mesa se anota en un lado, el gasto en otro y el stock en una planilla, el cierre del turno se discute en lugar de contarse. KEDASI junta ese circuito y deja por escrito qué efectivo debería haber en el cajón.');
  lay.h2('Objetivo general');
  lay.p('Operar el local de punta a punta desde un solo sistema, y poder dar de alta otro negocio sin mezclar sus ventas ni su stock.');
  lay.h2('Objetivos de la operación');
  lay.bullets([
    'Abrir mesa, retiro o delivery, y que el primer producto entre solo en la comanda nueva.',
    'Ver el salón con mesas libres, ocupadas y reservadas para un día y una hora.',
    'Mandar a cocina solamente lo que todavía no se había enviado.',
    'Cobrar, imprimir el ticket y descontar la receta del stock.',
    'Cerrar el turno con un efectivo esperado que reste solo los gastos pagados en efectivo.',
    'Llevar productos, stock, proveedores, ingresos de mercadería y reservas.',
    'Crear otro comercio desde el panel de administración, vacío, con un catálogo de ejemplo o copiado de un local existente.'
  ]);

  lay.h1('Alcance');
  lay.p('Entra en este sistema la operación diaria del salón y el mostrador, la pantalla de cocina, la caja por turno, el catálogo con variantes y receta, el stock, las reservas, los proveedores, las estadísticas del período, la configuración del local y el alta de comercios.');
  lay.p('Queda afuera la factura electrónica, el controlador fiscal, una aplicación de teléfono propia y el trabajo simultáneo de varias cajas editando el mismo pedido. El servidor es el único lugar donde se guardan los datos. Quien usa el sistema entra por el navegador a ese servidor.');

  lay.h1('Actores');
  lay.table(
    ['Actor', 'Entra a', 'Hace'],
    [
      ['Administración', 'Panel de negocios', 'Crea, edita, suspende o borra un comercio y puede entrar a su punto de venta.'],
      ['Encargado del local', 'El POS de su comercio', 'Abre el turno, atiende, cobra, carga gastos, productos, stock y proveedores. Cambia su clave.'],
      ['Cocina', 'KDS del mismo local', 'Sigue las comandas, marca preparación y las da por listas.'],
      ['Comensal', 'No entra al sistema', 'Llega por la mesa, el mostrador o el teléfono. El local carga el pedido.']
    ],
    [110, 130, 200]
  );
  lay.p('Un comercio no ve las cuentas de los demás ni abre los datos de otro local. La administración sí puede entrar al punto de venta de cualquiera de los negocios que dio de alta.');

  lay.h1('Rutina de campo');
  lay.p('Este es el orden de un servicio. Está escrito para usarlo al lado de la caja, no como un resumen.');

  lay.h2('Antes de abrir la puerta');
  lay.bullets([
    'MongoDB tiene que estar en marcha, en el puerto local 27017.',
    'El servidor de KEDASI tiene que estar levantado. En desarrollo se abre con dotnet run desde la carpeta BackendPOS y responde en http://localhost:5126.',
    'Entrar con el usuario de ese local. Si el servidor se reinició, la sesión anterior ya no sirve y hay que entrar de nuevo.'
  ]);

  lay.h2('Apertura de turno');
  lay.p('En Caja / Turnos se elige mañana, tarde o noche y se carga el fondo de cambio. Sin turno abierto el sistema no deja cobrar ni registrar un gasto. El fondo es el primer número del arqueo.');

  lay.h2('Durante el servicio');
  lay.table(
    ['Paso', 'Acción', 'Queda listo cuando'],
    [
      ['1', 'Mesa: elegirla en el salón. Retiro o delivery: crear el pedido y cargar cliente. En delivery, la dirección.', 'Hay una comanda abierta con origen visible.'],
      ['2', 'Tocar el producto. Si tiene variantes, elegir la opción. El precio que entra es el de esa opción, no un extra suelto.', 'El ítem figura en el ticket, también si la comanda se acaba de crear.'],
      ['3', 'Enviar a cocina. Un segundo envío de la misma comanda suma lo nuevo a la misma tarjeta.', 'En el KDS se ve el número de pedido, el origen y la nota.'],
      ['4', 'Cobrar. En mostrador: efectivo, Mercado Pago, QR, tarjeta o transferencia. En delivery: efectivo o pago electrónico.', 'La venta queda en el turno y, si corresponde, se imprime el ticket.'],
      ['5', 'Si el producto tiene receta y el descuento de stock está activo, los insumos bajan en ese cobro.', 'Si algo queda en el mínimo o por debajo, el aviso sale junto con la venta.']
    ],
    [42, 230, 180]
  );
  lay.note('La venta no se frena porque falte stock. En el servicio se cobra igual, el insumo no baja de cero y el aviso queda para reponer. El descuento se puede apagar en Configuración.');

  lay.h2('Cocina');
  lay.p('El KDS se puede apagar. Con el KDS apagado las comandas no viajan. Con el KDS prendido, la tarjeta nueva espera, se puede pasar a preparación y se puede marcar prioridad. Tachar un renglón lo da por hecho. A los 8 minutos la tarjeta entra en aviso y a los 15 queda urgente. El reloj se actualiza solo. Al enviar suena un pitido corto. Los últimos ocho listos se pueden devolver a cocina si se marcaron por error.');

  lay.h2('Gastos en medio del turno');
  lay.p('Un gasto pide turno abierto, concepto, rubro, medio, monto y una nota si hace falta. Los rubros son insumos, servicios, sueldos, delivery, urgencia u otro. Solo el medio Efectivo resta el cajón. Transferencia y Mercado Pago quedan en el historial y no mueven el efectivo esperado. Un gasto viejo, cargado sin medio, se toma como efectivo.');

  lay.h2('Cierre');
  lay.p('Se cuenta el efectivo del cajón. Lo esperado se calcula así: fondo inicial, más las ventas cobradas en efectivo, menos los gastos de ese turno cargados en efectivo. Los otros medios se informan aparte y no entran a esa cuenta. Para cerrar hay que escribir quién cierra y cuánto se contó. La diferencia queda en el historial de turnos.');
  lay.note('Ejemplo de arqueo, solo para leer la cuenta. Fondo $ 20.000. Ventas en efectivo $ 85.000. Ventas en otros medios $ 40.000. Gasto en efectivo $ 6.000. Gasto por transferencia $ 15.000. Efectivo esperado = 20.000 + 85.000 - 6.000 = $ 99.000. Los $ 40.000 y los $ 15.000 no mueven el cajón.');

  lay.h2('Después del servicio');
  lay.bullets([
    'Ingreso de mercadería: se elige proveedor, fecha, ítems y costo. Un insumo suma cantidad y, si hay costo, lo guarda. Un producto actualiza su costo y no tiene una cantidad de stock propia.',
    'El borrador del ingreso no se borra si en el medio se edita un proveedor. Al registrar, el historial guarda el nombre del proveedor aunque después se borre de la lista.',
    'Reservas: cliente, día, hora, personas y mesa opcional. Si la reserva es para hoy y no está cancelada ni marcada como asistió, la mesa se dibuja reservada, en amarillo, con la hora y el nombre.',
    'Conviene mirar el aviso de stock bajo y la visita del proveedor del día antes de hacer el pedido.'
  ]);

  lay.h1('Módulos');
  lay.h2('Ventas y salón');
  lay.p('La atención arma pedidos de mesa, retiro o delivery. El salón es un plano con mesas de varias formas, sillas, barra, puerta, ventanal, plantas y otros objetos. Se puede reservar día y hora desde la mesa. El color de la mesa dice el estado de hoy: libre, ocupada con pedido, o reservada. El ticket muestra si el pedido está abonado, permite comanda de cocina sin precios y ticket de mostrador.');
  lay.h2('Productos');
  lay.p('Cada producto tiene nombre, categoría, precio, costo, foto, tilde de delivery, grupos de opciones con precio fijo y una receta armada con insumos del stock. El listado filtra por categoría, muestra el margen y avisa si algún insumo de la receta está bajo. Se puede copiar un producto. El tilde de delivery y la columna dicen lo mismo.');
  lay.h2('Stock');
  lay.p('Los insumos se agrupan, tienen unidad, cantidad y mínimo. La fila se marca cuando la cantidad llega al mínimo. En edición se cambia el nombre, la unidad, la sección, el mínimo y la cantidad. La búsqueda no suelta el cursor. El valor estimado usa el último costo unitario cargado en un ingreso. Al cobrar, la receta se multiplica por la cantidad vendida y se resta.');
  lay.h2('KDS, gastos, proveedores, reservas, caja y estadísticas');
  lay.p('El KDS, los gastos, los proveedores y la caja se operan como dice la rutina de campo. Las reservas además permiten seña, total estimado y estado de asistencia. Las estadísticas filtran por período y por turno, y muestran el reparto de ventas y el listado para reimprimir un ticket. La configuración guarda nombre, teléfono, dirección, horario que sale en el ticket, pie, colores, impresión automática, KDS y descuento de receta. Desde ahí se descarga una copia JSON del local y se puede restaurar. Restaurar pisa los datos de ese comercio y conserva el usuario con el que se entró.');

  lay.h1('Arquitectura');
  lay.p('El navegador pide la página al servidor y, ya con sesión, habla con la API. Cada guardado del local espera un instante y manda el estado completo de ese comercio. La interfaz no trae una clave de vuelta: el servidor la saca antes de responder.');
  lay.table(
    ['Método y ruta', 'Quién puede', 'Para qué'],
    [
      ['POST /api/pos/login', 'Público, con límite de intentos', 'Entregar la sesión.'],
      ['GET /api/pos/session', 'Sesión vigente', 'Saber si sigue adentro y qué cuenta es.'],
      ['POST /api/pos/logout', 'Sesión vigente', 'Invalidar el token de ese navegador.'],
      ['GET y POST /api/pos/accounts', 'Solo administración', 'Listar y guardar los comercios. La clave no viaja de vuelta.'],
      ['GET, POST y DELETE /api/pos/store/{id}', 'El dueño de ese local, o administración', 'Leer, guardar o borrar los datos del comercio.'],
      ['POST /api/pos/profile', 'El local sobre su propia cuenta', 'Actualizar nombre, teléfono y dirección.'],
      ['POST /api/pos/password', 'El encargado de su cuenta', 'Cambiar la clave y cerrar las otras sesiones de esa cuenta.']
    ],
    [175, 145, 160]
  );
  lay.p('El servidor agrega encabezados para que el navegador no adivine el tipo de archivo, no embeba la página en otro sitio y no mande el referer. La página se sirve como archivo estático: un cambio de interfaz se ve al recargar, sin recompilar. Un cambio del servidor sí pide compilar y volver a levantar el proceso.');
  lay.p('Las cuentas están en un documento maestro. Cada local es otro documento, identificado con el id del comercio, y adentro guarda el estado entero: configuración, productos, stock, pedidos, ventas, cocina, plano, reservas, gastos, proveedores e ingresos.');

  lay.h1('Datos que guarda cada local');
  lay.table(
    ['Dato', 'Qué representa'],
    [
      ['cfg', 'Nombre, contacto, horario, pie del ticket, colores, impresión, KDS, descuento de stock y usuario. Sin clave.'],
      ['prod', 'Catálogo: precio, costo, categoría, delivery, foto, opciones y receta.'],
      ['stk', 'Insumos: sección, unidad, cantidad, mínimo y último costo.'],
      ['ped y ven', 'Comandas abiertas y ventas cerradas, con medio de pago y turno.'],
      ['kds y kdsListos', 'Comandas en cocina y las últimas dadas por listas.'],
      ['turno y tur', 'El turno abierto y el historial de cierres, con esperado y contado.'],
      ['gas', 'Gastos del local, con rubro, medio y turno.'],
      ['prv e ing', 'Proveedores e ingresos de mercadería.'],
      ['res y lay', 'Reservas, con mesa opcional, y el plano del salón.']
    ],
    [120, 360]
  );

  lay.h1('Seguridad y accesos');
  lay.bullets([
    'La clave de un comercio se guarda con PBKDF2-SHA256, 100.000 iteraciones y una sal propia. No se muestra de nuevo en el listado ni dentro de los datos del local.',
    'Si una cuenta vieja todavía tenía la clave en texto, el primer ingreso correcto la reemplaza por el hash.',
    'La sesión es un token al portador. Dura 14 horas de uso, con un rango permitido de 1 a 48 horas, y vive en la memoria del servidor.',
    'Ocho intentos fallidos para la misma dirección y el mismo usuario, en diez minutos, frenan el ingreso un rato.',
    'Suspender, borrar o cambiar la clave cierra las sesiones de esa cuenta.',
    'La administración y el comercio usan puertas distintas. El comercio no administra la lista de negocios.',
    'Al crear un negocio, la clave se muestra una sola vez, con opción de copiarla o de entrar directo. Después queda cifrada.'
  ]);
  lay.note('Las claves de administración están en la configuración del servidor. Este documento no las copia. Conviene cambiarlas antes de salir del uso local de prueba.');

  lay.h1('Alta de otro negocio');
  lay.p('Desde el panel de administración se busca por nombre, titular, usuario o dirección, y se filtra por rubro. El alta pide comercio, rubro, titular, contacto, usuario y clave. El usuario no puede repetirse ni usar un nombre reservado para la administración.');
  lay.p('El local puede empezar vacío, con el catálogo de ejemplo de panchos y bebidas, o copiando productos, stock, plano y proveedores de un negocio que ya existe. No se copian ventas, pedidos, caja ni cocina. Al guardar, la pantalla muestra usuario y clave para anotarlos.');

  lay.h1('Puesta en marcha');
  lay.bullets([
    'Tener instalado el runtime de .NET 10 y un MongoDB local en mongodb://localhost:27017.',
    'La base que usa la configuración es TonyPanchosPOS_DB. Si no existe, MongoDB la crea al primer guardado.',
    'Desde la carpeta BackendPOS, ejecutar el proyecto. El perfil HTTP publica http://localhost:5126. Hay un perfil HTTPS en el puerto 7266.',
    'Abrir esa dirección en el navegador del puesto. Entrar con el usuario del local, abrir un turno de prueba, cargar una venta y cerrar el turno antes de usarlo con clientes.',
    'Para otro puesto de la misma red, el servidor tiene que publicarse en una dirección alcanzable. La configuración actual de desarrollo escucha en la máquina local.'
  ]);

  lay.h1('Controles ya revisados');
  lay.p('Sobre el código y la API se revisó que la interfaz no tenga un error de sintaxis, que el servidor de desarrollo responda, que una cuenta de comercio no liste los negocios ni lea el local de otro, y que la lectura de cuentas y de tienda no devuelva la clave. El aislamiento se probó con una cuenta temporal, que después se eliminó.');
  lay.p('Antes de un servicio con público conviene una pasada en el local: abrir turno, vender una mesa con variante, verla en el KDS, cobrar en efectivo y en otro medio, cargar un gasto de cada tipo, cerrar el turno y comprobar que el esperado coincida con la cuenta de esta carpeta.');

  lay.h1('Límites conocidos');
  lay.bullets([
    'Reiniciar el servidor borra las sesiones. No borra ventas ni stock: eso está en MongoDB.',
    'El stock baja al cobrar, no al enviar a cocina. Una comanda anulada antes del cobro no descuenta.',
    'Si no alcanza el insumo, la cantidad queda en cero. No queda un negativo que muestre cuánto faltó.',
    'Dos navegadores pueden guardar el mismo local uno después del otro. El último guardado completo pisa al anterior.',
    'No hay factura fiscal ni libro de IVA.',
    'La copia de seguridad es del local abierto, no de la lista de cuentas.'
  ]);

  lay.h1('Glosario');
  lay.kv([
    ['Comanda', 'Pedido abierto. Puede ser mesa, retiro o delivery.'],
    ['KDS', 'Pantalla de cocina. Recibe lo enviado y lo que se cobra si el KDS está activo.'],
    ['Receta', 'Insumos y cantidades que usa una unidad del producto.'],
    ['Turno', 'Período de caja, con fondo, ventas, gastos y cierre.'],
    ['Cajón', 'Efectivo esperado: fondo, más efectivo cobrado, menos gastos en efectivo.'],
    ['Seña', 'Pago parcial de una reserva. No es una venta del turno.'],
    ['Plantilla', 'Modo de crear un negocio: vacío, de ejemplo o copiado de otro local.']
  ]);
}

function informe(lay) {
  lay.h1('Resumen');
  lay.p('KEDASI es el punto de venta del proyecto. Este informe cuenta cómo se construyó, qué se decidió dejar adentro y en qué estado se entrega el 17 de noviembre de 2026. El detalle para operarlo está en la carpeta de campo. Acá importa el criterio de construcción.');
  lay.p('El sistema atiende un local gastronómico y puede alojar otros negocios. La interfaz es una sola página. El servidor es ASP.NET Core 10. Los datos están en MongoDB. El nombre de cara al local es KEDASI. La base sigue llamándose TonyPanchosPOS_DB, que es el nombre con el que empezó el proyecto.');

  lay.h1('Punto de partida');
  lay.p('El punto de partida ya era un POS usable: ventas, salón, productos con opciones de precio fijo y receta, stock por secciones, gastos atados al turno, proveedores con ingreso de mercadería, caja, pantalla de cocina, estadísticas, configuración y un panel para más de un comercio. La interfaz vivía en un solo HTML y el servidor guardaba cada local como un documento.');
  lay.p('Esa base tenía el circuito, y también huecos de uso. La clave viajaba de un modo que no servía para dejar el sistema en manos de un local. El primer producto, si no había comanda, abría el pedido y no lo cargaba. El salón no decía con claridad si una mesa estaba libre, ocupada o reservada. El stock no bajaba al vender. El gasto, cualquiera fuera el medio, restaba efectivo. El proveedor se podía borrar o agregar, y el ingreso a medio cargar se perdía. El alta de un negocio nuevo no dejaba la clave a la vista ni ofrecía un modo de empezar.');

  lay.h1('Criterios que se sostuvieron');
  lay.bullets([
    'Un documento por comercio. El ticket, el plano, la receta y la caja se guardan juntos porque se usan juntos. Partirlos en decenas de tablas no le servía a la operación que ya estaba armada.',
    'La interfaz se refresca sin recompilar. El servidor se recompila solo cuando cambia la API.',
    'El navegador no es la autoridad. Sin sesión no hay cuentas ni datos de un local. La clave no vuelve en las lecturas.',
    'El color del sistema es el del local: rojo, blanco y amarillo. Una prueba con otra paleta se descartó porque el puesto dejaba de reconocerse.',
    'En el servicio no se bloquea el cobro por falta de stock. Se avisa y la cantidad queda en cero. Frenar la caja a la hora del pedido es peor que reponer después.',
    'El arqueo tiene que poder explicarse en una frase. Solo el efectivo entra y solo el gasto en efectivo sale.'
  ]);

  lay.h1('Cómo se fue armando');
  lay.h2('Acceso y cara del sistema');
  lay.p('Se reemplazó el ingreso por una sesión con token. La clave de cada comercio pasó a PBKDF2-SHA256, con 100.000 iteraciones y sal aleatoria. Ocho fallos en diez minutos, para la misma dirección y el mismo usuario, frenan el intento. El servidor manda encabezados para no embeber la página y no adivinar el contenido. La pantalla de ingreso quedó en rojo, blanco y un filo amarillo, con la palabra KEDASI.');
  lay.p('Las estadísticas se rehicieron como un tablero del período y del turno, dentro de la misma paleta. El salón se redibujó para que las mesas y los objetos se lean como parte del POS y no como un plano de otro sistema.');

  lay.h2('La comanda y la reserva');
  lay.p('Abrir una comanda pasó a devolver el pedido, y el producto que disparó la apertura entra en ese pedido. Si hace falta elegir mesa, la elección sigue y el producto no se pierde. En el salón, la mesa ocupada se pinta con el pedido abierto y la reservada con la reserva de hoy. La reserva tiene día, hora y mesa opcional, tanto desde el plano como desde el módulo de reservas.');

  lay.h2('Los módulos de administración del local');
  lay.p('Productos, stock, KDS, gastos, proveedores y configuración se llevaron al nivel de la rutina real, sin sacar lo que ya hacían.');
  lay.bullets([
    'Productos: filtro por categoría, margen, aviso de insumo bajo, copia del producto y formulario ancho para opciones, receta y foto. El tilde de delivery coincide con la columna.',
    'Stock: mínimo visible, fila marcada, edición de sección y búsqueda que no pierde el cursor. Al cobrar se descuenta la receta. El costo del insumo entra por el ingreso de mercadería y alimenta un valor estimado.',
    'KDS: número de pedido, suma de ítems sobre la misma comanda, prioridad, preparación, tachado, urgencia a los 8 y a los 15 minutos, pitido al enviar y devolución de un listo reciente.',
    'Gastos: rubro, medio y nota. El cajón solo resta Efectivo. Lo anterior, sin medio, sigue contando como efectivo para no romper cierres viejos.',
    'Proveedores: ficha editable, qué traen, nota, WhatsApp si hay teléfono y visita marcada si es hoy o ya venció. El historial conserva el nombre.',
    'Configuración: horario en el ticket, vista previa, interruptor del descuento de stock, descarga de la copia y restauración de esa copia.'
  ]);

  lay.h2('Más de un negocio');
  lay.p('El panel de administración ordena los comercios, filtra por rubro y muestra la fecha de alta. Crear un negocio ofrece tres arranques: vacío, catálogo de ejemplo, o copia de productos, stock, plano y proveedores de un local existente. Las ventas y la caja no se copian. La clave se muestra una sola vez. Desde esa misma pantalla se puede entrar al POS nuevo. Suspender una cuenta ahora espera la respuesta del servidor y, si falla, no deja la pantalla mintiendo.');

  lay.h1('Qué quedó entregado');
  lay.table(
    ['Pieza', 'Dónde está', 'Estado'],
    [
      ['Interfaz del POS', 'BackendPOS/wwwroot/index.html', 'Operativa. Se actualiza al recargar.'],
      ['API y sesión', 'Controllers/PosSyncController.cs', 'Login, cuentas, local, perfil y clave.'],
      ['Arranque', 'Program.cs y appsettings.json', 'Estáticos, API, Mongo y parámetros de sesión.'],
      ['Proyecto', 'BackendPOS.csproj', '.NET 10 y MongoDB.Driver 3.14.'],
      ['Esta documentación', 'Documentacion/Carpeta de campo', 'Carpeta de campo e informe, versión 1.0.']
    ],
    [120, 200, 160]
  );
  lay.p('El flujo que el local puede hacer hoy es el de la carpeta de campo: abrir turno, atender, cocinar, cobrar, gastar, cerrar, reponer y, si hace falta, sumar otro comercio.');

  lay.h1('Correcciones que cambiaron el uso');
  lay.table(
    ['Situación', 'Qué pasaba', 'Qué hace ahora'],
    [
      ['Primer producto', 'Abría la comanda y había que tocarlo de nuevo.', 'La comanda nace con ese producto adentro.'],
      ['Mesa reservada', 'El plano no seguía a las reservas.', 'Hoy, con día y hora, la mesa se marca reservada.'],
      ['Receta', 'Estaba cargada y la venta no la consumía.', 'El cobro descuenta los insumos y avisa si quedan bajos.'],
      ['Gasto', 'Cualquier gasto bajaba el efectivo esperado.', 'Solo el efectivo baja el cajón.'],
      ['Proveedor', 'Guardar uno borraba el ingreso a medio armar.', 'El borrador se mantiene. El historial guarda el nombre.'],
      ['Negocio nuevo', 'La clave desaparecía al cerrar el formulario.', 'Se muestra una vez, se puede copiar y se puede entrar.']
    ],
    [100, 190, 190]
  );

  lay.h1('Seguridad, en la construcción');
  lay.p('La sesión no se guarda en el navegador como una cuenta abierta para siempre: hay un token, una expiración y un cierre al salir. Cambiar la clave, suspender o borrar cierra las sesiones de esa cuenta. El comercio que entra a su POS no recibe la lista de comercios. Al leer un local, el servidor elimina la clave del documento antes de mandarlo, y también la saca si alguien intenta guardarla adentro de la configuración.');
  lay.p('La comparación de la clave de administración y la de una cuenta todavía no migrada se hace en tiempo constante, para no orientar un intento. Eso no reemplaza sacar el sistema de una red abierta ni cambiar las claves de la configuración de desarrollo.');

  lay.h1('Cómo se levanta');
  lay.bullets([
    'MongoDB escuchando en mongodb://localhost:27017.',
    'En BackendPOS, dotnet run. Perfil HTTP: http://localhost:5126.',
    'El primer documento de cuentas, si la base está vacía, puede sembrar un local inicial. Si la base ya tiene comercios, no los pisa.',
    'Recargar el navegador alcanza para ver un cambio de la página. Un cambio de la API pide volver a compilar.'
  ]);
  lay.note('No se documentan usuarios ni claves. Están en la configuración del servidor y en las cuentas, cifradas.');

  lay.h1('Verificación');
  lay.p('La interfaz se controló con el analizador de sintaxis de JavaScript, sin error. El proyecto de servidor compiló. La API se probó con sesión de administración y con una cuenta de comercio temporal: esa cuenta no pudo listar negocios ni leer otro local, y la respuesta del local no traía clave. La cuenta de prueba se borró al terminar. El servidor de desarrollo respondió en el puerto 5126.');
  lay.p('No se recorrió cada pantalla con el mouse en esta entrega del informe. El control de campo que falta es el del propio local: un turno de prueba completo, con mesa, cocina, dos medios de pago, un gasto en efectivo, un gasto por transferencia y el cierre. La cuenta esperada está escrita en la carpeta de campo.');

  lay.h1('Límites que quedan abiertos');
  lay.bullets([
    'Las sesiones están en la memoria del proceso. Un reinicio obliga a entrar de nuevo. No se pierde la venta ya guardada.',
    'El último guardado completo del local gana. No hay fusión si dos puestos editan a la vez.',
    'No hay factura electrónica ni impresión fiscal.',
    'El stock no expresa faltante negativo.',
    'La copia JSON restaura un local, no el padrón de cuentas.',
    'Publicar el sistema fuera de la máquina de desarrollo exige una dirección de red, HTTPS de verdad y claves distintas de las de prueba.'
  ]);

  lay.h1('Cierre');
  lay.p('KEDASI queda como el sistema de operación del local y como la base para sumar negocios. La carpeta de campo es la pieza que se lleva al puesto. Este informe es la pieza que explica por qué el sistema está armado así y qué no hay que dar por hecho.');
  lay.p('Lo que conviene cuidar de acá en adelante es simple: no mezclar el efectivo con los otros medios, no apagar el descuento de stock sin saberlo, y anotar la clave de un negocio nuevo en el momento en que el sistema la muestra. El resto del circuito ya tiene un lugar en la pantalla.');
}

async function main() {
  const carpetaFile = path.join(OUT, 'KEDASI - Carpeta de campo.pdf');
  const informeFile = path.join(OUT, 'KEDASI - Informe de creacion.pdf');

  await render(
    carpetaFile,
    {
      Title: 'KEDASI — Carpeta de campo',
      Author: 'Agustín Urtubía',
      Subject: 'Documento de campo del sistema de punto de venta KEDASI',
      Keywords: 'KEDASI, POS, carpeta de campo'
    },
    'Carpeta de campo',
    {
      code: 'KEDASI  ·  CC  ·  2026  ·  01',
      kind: 'Carpeta de campo',
      lead: 'Relevamiento, rutina de servicio y diseño del sistema, para quien atiende, cobra, cocina y da de alta un negocio.',
      facts: [
        ['01', 'Servicio', 'Salón, mostrador y delivery'],
        ['02', 'Cocina y caja', 'Comanda, KDS y arqueo'],
        ['03', 'Negocios', 'Cada local con su stock']
      ],
      meta: META
    },
    carpeta
  );

  await render(
    informeFile,
    {
      Title: 'KEDASI — Informe de creación del sistema',
      Author: 'Agustín Urtubía',
      Subject: 'Informe de creación del punto de venta KEDASI',
      Keywords: 'KEDASI, POS, informe'
    },
    'Informe de creación',
    {
      code: 'KEDASI  ·  IC  ·  2026  ·  01',
      kind: 'Informe de creación del sistema',
      lead: 'Cómo se construyó KEDASI, qué criterios quedaron en el producto y en qué estado se entrega.',
      facts: [
        ['01', 'Criterio', 'Un documento por comercio'],
        ['02', 'Caja', 'Solo el efectivo mueve el cajón'],
        ['03', 'Acceso', 'Clave cifrada y sesión']
      ],
      meta: META
    },
    informe
  );

  console.log(carpetaFile);
  console.log(informeFile);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
