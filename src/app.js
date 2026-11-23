const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, DATA_DIR } = require('./db');
const { generarToken, requireAuth, requireAdmin } = require('./auth');
const { registrarMetricasRuta } = require('./metrics');
const { registrarBandwidth } = require('./infraMetrics');
const logger = require('./logger');

const app = express();
app.use(express.json());
app.use(registrarBandwidth);
app.use(registrarMetricasRuta);
// index:false evita que se sirva public/index.html en GET "/": esa ruta
// sigue siendo el endpoint JSON de salud de la API (ver mas abajo). El
// frontend se abre explicitamente en /index.html, /productos.html, etc.
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

// Respuesta estandarizada { statusCode, data }
function respond(res, statusCode, data) {
  return res.status(statusCode).json({ statusCode, data });
}

// ---------- Validaciones reutilizables ----------
const esTextoValido = (v) => typeof v === 'string' && v.trim().length > 0;
const esEnteroPositivo = (v) => Number.isInteger(v) && v > 0;

// Devuelve el id numérico o null si el parámetro de ruta no es un entero positivo
function parseId(param) {
  return /^\d+$/.test(param) && Number(param) > 0 ? Number(param) : null;
}

// Valida el body de un producto; devuelve un mensaje de error o null si es válido
function validarProducto(body) {
  const { nombre, precio, stock, categoria_id } = body;
  if (!esTextoValido(nombre) || precio === undefined || categoria_id === undefined) {
    return 'Los campos "nombre", "precio" y "categoria_id" son requeridos';
  }
  if (typeof precio !== 'number' || !Number.isFinite(precio) || precio < 0) {
    return '"precio" debe ser un número mayor o igual a 0';
  }
  if (stock !== undefined && (!Number.isInteger(stock) || stock < 0)) {
    return '"stock" debe ser un entero mayor o igual a 0';
  }
  if (!esEnteroPositivo(categoria_id)) {
    return '"categoria_id" debe ser un entero positivo';
  }
  return null;
}

// ============================================================
// LOGIN
// ============================================================

// POST /api/login - autenticacion, devuelve un JWT
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!esTextoValido(username) || !esTextoValido(password)) {
    return respond(res, 400, { mensaje: 'Los campos "username" y "password" son requeridos' });
  }
  const usuario = db.prepare('SELECT * FROM usuarios WHERE username = ?').get(username.trim());
  if (!usuario || !bcrypt.compareSync(password, usuario.password_hash)) {
    return respond(res, 401, { mensaje: 'Usuario o contraseña incorrectos' });
  }
  const token = generarToken(usuario);
  respond(res, 200, { token, usuario: { id: usuario.id, username: usuario.username, rol: usuario.rol } });
});

// ============================================================
// USUARIOS (CRUD, protegido - requiere sesion de admin)
// ============================================================

function sanitizarUsuario(row) {
  if (!row) return row;
  const { password_hash, ...resto } = row;
  return resto;
}

// GET /api/usuarios - listar (solo admin)
app.get('/api/usuarios', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM usuarios').all().map(sanitizarUsuario);
  respond(res, 200, rows);
});

// GET /api/usuarios/:id - obtener uno (solo admin)
app.get('/api/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return respond(res, 400, { mensaje: 'El id debe ser un entero positivo' });
  const row = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!row) return respond(res, 404, { mensaje: 'Usuario no encontrado' });
  respond(res, 200, sanitizarUsuario(row));
});

// POST /api/usuarios - crear (solo admin)
app.post('/api/usuarios', requireAuth, requireAdmin, (req, res) => {
  const { username, password, rol } = req.body || {};
  if (!esTextoValido(username) || !esTextoValido(password)) {
    return respond(res, 400, { mensaje: 'Los campos "username" y "password" son requeridos' });
  }
  if (password.length < 6) {
    return respond(res, 400, { mensaje: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const dup = db.prepare('SELECT id FROM usuarios WHERE username = ?').get(username.trim());
  if (dup) return respond(res, 409, { mensaje: 'Ya existe un usuario con ese username' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO usuarios (username, password_hash, rol) VALUES (?, ?, ?)')
    .run(username.trim(), hash, rol === 'admin' ? 'admin' : 'operador');
  respond(res, 201, sanitizarUsuario(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(info.lastInsertRowid)));
});

// PUT /api/usuarios/:id - actualizar (solo admin)
app.put('/api/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return respond(res, 400, { mensaje: 'El id debe ser un entero positivo' });
  const existente = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!existente) return respond(res, 404, { mensaje: 'Usuario no encontrado' });

  const { username, password, rol } = req.body || {};
  if (!esTextoValido(username)) {
    return respond(res, 400, { mensaje: 'El campo "username" es requerido' });
  }
  const dup = db.prepare('SELECT id FROM usuarios WHERE username = ? AND id <> ?').get(username.trim(), id);
  if (dup) return respond(res, 409, { mensaje: 'Ya existe un usuario con ese username' });

  const nuevoHash = password ? bcrypt.hashSync(password, 10) : existente.password_hash;
  if (password && password.length < 6) {
    return respond(res, 400, { mensaje: 'La contraseña debe tener al menos 6 caracteres' });
  }
  db.prepare('UPDATE usuarios SET username = ?, password_hash = ?, rol = ? WHERE id = ?')
    .run(username.trim(), nuevoHash, rol === 'admin' ? 'admin' : 'operador', id);
  respond(res, 200, sanitizarUsuario(db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id)));
});

// DELETE /api/usuarios/:id - eliminar (solo admin)
app.delete('/api/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return respond(res, 400, { mensaje: 'El id debe ser un entero positivo' });
  if (req.usuario.sub === id) {
    return respond(res, 400, { mensaje: 'No puedes eliminar tu propio usuario mientras tienes la sesion activa' });
  }
  const info = db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
  if (info.changes === 0) return respond(res, 404, { mensaje: 'Usuario no encontrado' });
  respond(res, 200, { mensaje: 'Usuario eliminado', id });
});

// ============================================================
// CATEGORIAS (5 endpoints)
// ============================================================

// 1. GET /api/categorias - listar todas
app.get('/api/categorias', (req, res) => {
  respond(res, 200, db.prepare('SELECT * FROM categorias').all());
});

// 2. GET /api/categorias/:id - obtener una
app.get('/api/categorias/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return respond(res, 400, { mensaje: 'El id debe ser un entero positivo' });
  const row = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id);
  if (!row) return respond(res, 404, { mensaje: 'Categoría no encontrada' });
  respond(res, 200, row);
});

// 3. POST /api/categorias - crear
app.post('/api/categorias', requireAuth, (req, res) => {
  const { nombre, descripcion } = req.body || {};
  if (!esTextoValido(nombre)) {
    return respond(res, 400, { mensaje: 'El campo "nombre" es requerido' });
  }
  const dup = db.prepare('SELECT id FROM categorias WHERE nombre = ?').get(nombre.trim());
  if (dup) return respond(res, 409, { mensaje: 'Ya existe una categoría con ese nombre' });

  const info = db
    .prepare('INSERT INTO categorias (nombre, descripcion) VALUES (?, ?)')
    .run(nombre.trim(), descripcion || null);
  respond(res, 201, db.prepare('SELECT * FROM categorias WHERE id = ?').get(info.lastInsertRowid));
});

// 4. PUT /api/categorias/:id - actualizar
app.put('/api/categorias/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return respond(res, 400, { mensaje: 'El id debe ser un entero positivo' });
  const { nombre, descripcion } = req.body || {};
  if (!esTextoValido(nombre)) {
    return respond(res, 400, { mensaje: 'El campo "nombre" es requerido' });
  }
  if (!db.prepare('SELECT id FROM categorias WHERE id = ?').get(id)) {
    return respond(res, 404, { mensaje: 'Categoría no encontrada' });
  }
  const dup = db.prepare('SELECT id FROM categorias WHERE nombre = ? AND id <> ?').get(nombre.trim(), id);
  if (dup) return respond(res, 409, { mensaje: 'Ya existe una categoría con ese nombre' });

  db.prepare('UPDATE categorias SET nombre = ?, descripcion = ? WHERE id = ?')
    .run(nombre.trim(), descripcion || null, id);
  respond(res, 200, db.prepare('SELECT * FROM categorias WHERE id = ?').get(id));
});

// 5. DELETE /api/categorias/:id - eliminar (borra en cascada sus productos)
app.delete('/api/categorias/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return respond(res, 400, { mensaje: 'El id debe ser un entero positivo' });
  const info = db.prepare('DELETE FROM categorias WHERE id = ?').run(id);
  if (info.changes === 0) return respond(res, 404, { mensaje: 'Categoría no encontrada' });
  respond(res, 200, { mensaje: 'Categoría eliminada', id });
});

// ============================================================
// PRODUCTOS (5 endpoints)
// ============================================================

// 6. GET /api/productos - listar todos (con nombre de categoría incluido)
app.get('/api/productos', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.nombre AS categoria_nombre
    FROM productos p
    JOIN categorias c ON c.id = p.categoria_id
  `).all();
  respond(res, 200, rows);
});

// 7. GET /api/productos/:id - obtener uno
app.get('/api/productos/:id', (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return respond(res, 400, { mensaje: 'El id debe ser un entero positivo' });
  const row = db.prepare('SELECT * FROM productos WHERE id = ?').get(id);
  if (!row) return respond(res, 404, { mensaje: 'Producto no encontrado' });
  respond(res, 200, row);
});

// 8. POST /api/productos - crear
app.post('/api/productos', requireAuth, (req, res) => {
  const body = req.body || {};
  const error = validarProducto(body);
  if (error) return respond(res, 400, { mensaje: error });

  const { nombre, precio, stock, categoria_id } = body;
  if (!db.prepare('SELECT id FROM categorias WHERE id = ?').get(categoria_id)) {
    return respond(res, 400, { mensaje: 'categoria_id no existe' });
  }
  const info = db
    .prepare('INSERT INTO productos (nombre, precio, stock, categoria_id) VALUES (?, ?, ?, ?)')
    .run(nombre.trim(), precio, stock || 0, categoria_id);
  respond(res, 201, db.prepare('SELECT * FROM productos WHERE id = ?').get(info.lastInsertRowid));
});

// 9. PUT /api/productos/:id - actualizar
app.put('/api/productos/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return respond(res, 400, { mensaje: 'El id debe ser un entero positivo' });
  const body = req.body || {};
  const error = validarProducto(body);
  if (error) return respond(res, 400, { mensaje: error });

  if (!db.prepare('SELECT id FROM productos WHERE id = ?').get(id)) {
    return respond(res, 404, { mensaje: 'Producto no encontrado' });
  }
  const { nombre, precio, stock, categoria_id } = body;
  if (!db.prepare('SELECT id FROM categorias WHERE id = ?').get(categoria_id)) {
    return respond(res, 400, { mensaje: 'categoria_id no existe' });
  }
  db.prepare('UPDATE productos SET nombre = ?, precio = ?, stock = ?, categoria_id = ? WHERE id = ?')
    .run(nombre.trim(), precio, stock || 0, categoria_id, id);
  respond(res, 200, db.prepare('SELECT * FROM productos WHERE id = ?').get(id));
});

// 10. DELETE /api/productos/:id - eliminar
app.delete('/api/productos/:id', requireAuth, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return respond(res, 400, { mensaje: 'El id debe ser un entero positivo' });
  const info = db.prepare('DELETE FROM productos WHERE id = ?').run(id);
  if (info.changes === 0) return respond(res, 404, { mensaje: 'Producto no encontrado' });
  respond(res, 200, { mensaje: 'Producto eliminado', id });
});

// ============================================================
// ADMINISTRACION DE LA BASE DE DATOS (2 endpoints)
// ============================================================

// 11. POST /api/backup - respaldar la BD (el archivo queda en la carpeta data/)
app.post('/api/backup', requireAuth, requireAdmin, (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(DATA_DIR, `backup-${timestamp}.db`);
  db.backup(backupPath)
    .then(() => {
      respond(res, 200, { mensaje: 'Backup creado', archivo: path.basename(backupPath) });
    })
    .catch((err) => {
      respond(res, 500, { mensaje: 'Error al crear backup', error: err.message });
    });
});

// 12. DELETE /api/reset - vaciar la BD (productos y categorias)
app.delete('/api/reset', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM productos').run();
  db.prepare('DELETE FROM categorias').run();
  respond(res, 200, { mensaje: 'Base de datos vaciada correctamente' });
});

// Endpoint raíz - para verificar rápidamente que la API responde
app.get('/', (req, res) => {
  respond(res, 201, { mensaje: 'API funcionando correctamente uteq' });
});

// ---------- Manejo de errores (siempre responde con { statusCode, data }) ----------
app.use((req, res) => {
  respond(res, 404, { mensaje: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return respond(res, 400, { mensaje: 'El body no es un JSON válido' });
  }
  logger.error('Excepcion no controlada en la API', {
    mensaje: err.message,
    ruta: `${req.method} ${req.originalUrl}`,
    stack: err.stack,
  });
  respond(res, err.status || 500, { mensaje: 'Error interno del servidor' });
});

module.exports = app;
