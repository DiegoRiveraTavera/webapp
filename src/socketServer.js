const net = require('net');
const { db } = require('./db');

// Protocolo de texto plano sobre TCP:
//   {insert:<json>}  -> inserta un producto. <json> usa el mismo formato
//                       que el body de POST /api/productos:
//                       {"nombre":"...","precio":0,"stock":0,"categoria_id":1}
//   {get:<id>}        -> obtiene el producto con ese id.
//
// Cada mensaje debe terminar con salto de linea (\n). La respuesta sigue
// el mismo esquema { statusCode, data } que la API REST, tambien
// terminada en \n.

function responder(socket, statusCode, data) {
  socket.write(JSON.stringify({ statusCode, data }) + '\n');
}

function manejarInsert(socket, payload) {
  let body;
  try {
    body = JSON.parse(payload);
  } catch (err) {
    return responder(socket, 400, { mensaje: 'JSON invalido en insert' });
  }

  const { nombre, precio, stock, categoria_id } = body;
  if (!nombre || precio === undefined || !categoria_id) {
    return responder(socket, 400, {
      mensaje: 'Los campos "nombre", "precio" y "categoria_id" son requeridos',
    });
  }

  const categoria = db.prepare('SELECT id FROM categorias WHERE id = ?').get(categoria_id);
  if (!categoria) {
    return responder(socket, 400, { mensaje: 'categoria_id no existe' });
  }

  const stmt = db.prepare(
    'INSERT INTO productos (nombre, precio, stock, categoria_id) VALUES (?, ?, ?, ?)'
  );
  const info = stmt.run(nombre, precio, stock || 0, categoria_id);
  const nuevo = db.prepare('SELECT * FROM productos WHERE id = ?').get(info.lastInsertRowid);
  responder(socket, 201, nuevo);
}

function manejarGet(socket, payload) {
  const id = payload.trim();
  const row = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
  if (!row) {
    return responder(socket, 404, { mensaje: 'Producto no encontrado' });
  }
  responder(socket, 200, row);
}

function manejarMensaje(socket, raw) {
  // Captura: { insert | get : <resto hasta el ultimo "}" del mensaje> }
  const match = raw.match(/^\{(insert|get):([\s\S]*)\}$/);
  if (!match) {
    return responder(socket, 400, {
      mensaje: 'Formato invalido. Usa {insert:<json>} o {get:<id>}',
    });
  }

  const [, accion, payload] = match;
  if (accion === 'insert') return manejarInsert(socket, payload);
  if (accion === 'get') return manejarGet(socket, payload);
}

function iniciarServidorSockets(port) {
  const server = net.createServer((socket) => {
    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const linea = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (linea.length > 0) {
          manejarMensaje(socket, linea);
        }
      }
    });

    socket.on('error', () => {
      // Evita que un cliente que cierra abruptamente tumbe el proceso
    });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`Servidor de sockets TCP escuchando en el puerto ${port}`);
  });

  return server;
}

module.exports = { iniciarServidorSockets };