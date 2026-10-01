const net = require('net');
const { db } = require('./db');

const TCP_PORT = process.env.TCP_PORT || 6061;

// Mismo esquema que la API HTTP: { statusCode, data }
function reply(socket, statusCode, data) {
  socket.write(JSON.stringify({ statusCode, data }) + '\n');
}

function handleInsert(el) {
  // Con categoria_id es un producto; sin él, una categoría
  if (el.categoria_id !== undefined) {
    const { nombre, precio, stock, categoria_id } = el;
    if (!nombre || precio === undefined || !categoria_id) {
      return { code: 400, data: { mensaje: 'Faltan "nombre", "precio" o "categoria_id"' } };
    }
    const cat = db.prepare('SELECT id FROM categorias WHERE id = ?').get(categoria_id);
    if (!cat) return { code: 400, data: { mensaje: 'categoria_id no existe' } };
    const info = db
      .prepare('INSERT INTO productos (nombre, precio, stock, categoria_id) VALUES (?, ?, ?, ?)')
      .run(nombre, precio, stock || 0, categoria_id);
    return { code: 201, data: db.prepare('SELECT * FROM productos WHERE id = ?').get(info.lastInsertRowid) };
  }

  if (!el.nombre) return { code: 400, data: { mensaje: 'El campo "nombre" es requerido' } };
  const info = db
    .prepare('INSERT INTO categorias (nombre, descripcion) VALUES (?, ?)')
    .run(el.nombre, el.descripcion || null);
  return { code: 201, data: db.prepare('SELECT * FROM categorias WHERE id = ?').get(info.lastInsertRowid) };
}

function handleGet(el) {
  const tipo = el.tipo || 'productos';
  if (!['productos', 'categorias'].includes(tipo)) {
    return { code: 400, data: { mensaje: 'tipo debe ser "productos" o "categorias"' } };
  }
  let rows;
  if (el.id !== undefined) rows = db.prepare(`SELECT * FROM ${tipo} WHERE id = ?`).all(el.id);
  else if (el.nombre) rows = db.prepare(`SELECT * FROM ${tipo} WHERE nombre = ?`).all(el.nombre);
  else rows = db.prepare(`SELECT * FROM ${tipo}`).all();

  if ((el.id !== undefined || el.nombre) && rows.length === 0) {
    return { code: 404, data: { mensaje: 'Elemento no encontrado' } };
  }
  return { code: 200, data: rows };
}

function processMessage(socket, line) {
  const msg = line.trim();
  if (!msg) return;

  // Formato esperado: {insert:<json>}  o  {get:<json>}
  const match = msg.match(/^\{\s*(insert|get)\s*:\s*([\s\S]*)\}$/);
  if (!match) {
    return reply(socket, 400, { mensaje: 'Formato inválido. Use {insert:<element>} o {get:<element>}' });
  }

  let element;
  try {
    element = JSON.parse(match[2]);
  } catch (e) {
    return reply(socket, 400, { mensaje: '<element> no es un JSON válido' });
  }

  try {
    const result = match[1] === 'insert' ? handleInsert(element) : handleGet(element);
    reply(socket, result.code, result.data);
  } catch (err) {
    reply(socket, 500, { mensaje: 'Error interno', error: err.message });
  }
}

const server = net.createServer((socket) => {
  console.log('Cliente TCP conectado:', socket.remoteAddress);
  let buffer = '';

  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      processMessage(socket, buffer.slice(0, idx));
      buffer = buffer.slice(idx + 1);
    }
  });

  // Si el cliente cierra sin mandar salto de línea, procesa lo que quedó
  socket.on('end', () => processMessage(socket, buffer));
  socket.on('error', (err) => console.log('Error en socket:', err.message));
});

server.listen(TCP_PORT, '0.0.0.0', () => {
  console.log(`Servidor TCP escuchando en el puerto ${TCP_PORT}`);
});

module.exports = server;