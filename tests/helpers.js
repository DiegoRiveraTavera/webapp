const { db } = require('../src/db');
const { generarToken } = require('../src/auth');

// Token de un admin de prueba (no depende de que exista en la BD: el JWT
// se valida por firma, no por consulta a usuarios, asi que sirve para
// probar las rutas protegidas sin depender del seed de db.js).
const tokenAdminTest = generarToken({ id: 1, username: 'admin-test', rol: 'admin' });
const authHeader = { Authorization: `Bearer ${tokenAdminTest}` };

// Deja la BD limpia (y reinicia los ids) antes de cada prueba
function resetDb() {
  db.exec('DELETE FROM productos; DELETE FROM categorias; DELETE FROM sqlite_sequence;');
}

// Verifica el esquema { statusCode, data } y que statusCode coincida con el HTTP status
function expectEnvelope(res, status) {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toHaveProperty('statusCode', status);
  expect(res.body).toHaveProperty('data');
}

const crearCategoria = (nombre = 'Electrónica', descripcion = null) =>
  db.prepare('INSERT INTO categorias (nombre, descripcion) VALUES (?, ?)').run(nombre, descripcion).lastInsertRowid;

const crearProducto = (nombre = 'Laptop', precio = 15000, stock = 5, categoria_id = 1) =>
  db.prepare('INSERT INTO productos (nombre, precio, stock, categoria_id) VALUES (?, ?, ?, ?)')
    .run(nombre, precio, stock, categoria_id).lastInsertRowid;

module.exports = { db, resetDb, expectEnvelope, crearCategoria, crearProducto, authHeader };
