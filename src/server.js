const express = require('express');
const fs = require('fs');
const path = require('path');
const { db, DB_PATH, DATA_DIR } = require('./db');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Respuesta estandarizada { statusCode, data }
function respond(res, statusCode, data) {
  return res.status(statusCode).json({ statusCode, data });
}

// ============================================================
// CATEGORIAS (4 endpoints)
// ============================================================

// 1. GET /api/categorias - listar todas
app.get('/api/categorias', (req, res) => {
  const rows = db.prepare('SELECT * FROM categorias').all();
  respond(res, 200, rows);
});

// 2. GET /api/categorias/:id - obtener una
app.get('/api/categorias/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM categorias WHERE id = ?').get(req.params.id);
  if (!row) return respond(res, 404, { mensaje: 'Categoría no encontrada' });
  respond(res, 200, row);
});

// 3. POST /api/categorias - crear
app.post('/api/categorias', (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) return respond(res, 400, { mensaje: 'El campo "nombre" es requerido' });
  const stmt = db.prepare('INSERT INTO categorias (nombre, descripcion) VALUES (?, ?)');
  const info = stmt.run(nombre, descripcion || null);
  const nueva = db.prepare('SELECT * FROM categorias WHERE id = ?').get(info.lastInsertRowid);
  respond(res, 201, nueva);
});

// 4. DELETE /api/categorias/:id - eliminar
app.delete('/api/categorias/:id', (req, res) => {
  const info = db.prepare('DELETE FROM categorias WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return respond(res, 404, { mensaje: 'Categoría no encontrada' });
  respond(res, 200, { mensaje: 'Categoría eliminada', id: Number(req.params.id) });
});

// ============================================================
// PRODUCTOS (4 endpoints)
// ============================================================

// 5. GET /api/productos - listar todos (con nombre de categoría incluido)
app.get('/api/productos', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.nombre AS categoria_nombre
    FROM productos p
    JOIN categorias c ON c.id = p.categoria_id
  `).all();
  respond(res, 200, rows);
});

// 6. GET /api/productos/:id - obtener uno
app.get('/api/productos/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM productos WHERE id = ?').get(req.params.id);
  if (!row) return respond(res, 404, { mensaje: 'Producto no encontrado' });
  respond(res, 200, row);
});

// 7. POST /api/productos - crear
app.post('/api/productos', (req, res) => {
  const { nombre, precio, stock, categoria_id } = req.body;
  if (!nombre || precio === undefined || !categoria_id) {
    return respond(res, 400, { mensaje: 'Los campos "nombre", "precio" y "categoria_id" son requeridos' });
  }
  const categoria = db.prepare('SELECT id FROM categorias WHERE id = ?').get(categoria_id);
  if (!categoria) return respond(res, 400, { mensaje: 'categoria_id no existe' });

  const stmt = db.prepare('INSERT INTO productos (nombre, precio, stock, categoria_id) VALUES (?, ?, ?, ?)');
  const info = stmt.run(nombre, precio, stock || 0, categoria_id);
  const nuevo = db.prepare('SELECT * FROM productos WHERE id = ?').get(info.lastInsertRowid);
  respond(res, 201, nuevo);
});

// 8. DELETE /api/productos/:id - eliminar
app.delete('/api/productos/:id', (req, res) => {
  const info = db.prepare('DELETE FROM productos WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return respond(res, 404, { mensaje: 'Producto no encontrado' });
  respond(res, 200, { mensaje: 'Producto eliminado', id: Number(req.params.id) });
});

// ============================================================
// ADMINISTRACION DE LA BASE DE DATOS (2 endpoints)
// ============================================================

// 9. GET /api/backup - respaldar la BD y descargarla
app.get('/api/backup', (req, res) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `backup-${timestamp}.db`;
  const backupPath = path.join(DATA_DIR, fileName);

  db.backup(backupPath)
    .then(() => {
      res.download(backupPath, fileName, (err) => {
        // Borra el archivo temporal del servidor después de enviarlo
        fs.unlink(backupPath, () => {});
        if (err && !res.headersSent) {
          respond(res, 500, { mensaje: 'Error al descargar backup', error: err.message });
        }
      });
    })
    .catch((err) => {
      respond(res, 500, { mensaje: 'Error al crear backup', error: err.message });
    });
});

// 10. DELETE /api/reset - vaciar la BD (productos y categorias)
app.delete('/api/reset', (req, res) => {
  db.prepare('DELETE FROM productos').run();
  db.prepare('DELETE FROM categorias').run();
  respond(res, 200, { mensaje: 'Base de datos vaciada correctamente' });
});

// ============================================================
// Endpoint raíz - para verificar rápidamente que la API responde
// ============================================================
app.get('/', (req, res) => {
  respond(res, 200, { mensaje: 'API de Inventario funcionando correctamente' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
  console.log(`Base de datos en: ${DB_PATH}`);
});

// Servidor TCP (puerto 6061) en el mismo proceso
require('./tcp');
