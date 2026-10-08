const fs = require('fs');
const path = require('path');
const request = require('supertest');
const Database = require('better-sqlite3');
const app = require('../src/app');
const { resetDb, expectEnvelope, crearCategoria, crearProducto, db } = require('./helpers');

beforeEach(resetDb);

describe('GET / (health check)', () => {
  test('responde 200 con el mensaje de la API', async () => {
    const res = await request(app).get('/');
    expectEnvelope(res, 200);
    expect(res.body.data.mensaje).toMatch(/funcionando/i);
  });
});

describe('POST /api/backup', () => {
  test('crea el respaldo y devuelve el nombre del archivo', async () => {
    const res = await request(app).post('/api/backup');
    expectEnvelope(res, 200);
    expect(res.body.data.mensaje).toBe('Backup creado');
    expect(res.body.data.archivo).toMatch(/^backup-.*\.db$/);
    expect(fs.existsSync(path.join(process.env.DATA_DIR, res.body.data.archivo))).toBe(true);
  });

  test('el respaldo es un SQLite válido con los datos actuales', async () => {
    crearCategoria('Respaldo');
    crearProducto('Disco', 1200, 4, 1);

    const res = await request(app).post('/api/backup');
    const archivo = path.join(process.env.DATA_DIR, res.body.data.archivo);
    expect(fs.readFileSync(archivo).subarray(0, 15).toString()).toBe('SQLite format 3');

    const copia = new Database(archivo, { readonly: true });
    expect(copia.prepare('SELECT COUNT(*) AS n FROM categorias').get().n).toBe(1);
    expect(copia.prepare('SELECT nombre FROM productos').get().nombre).toBe('Disco');
    copia.close();
  });

  test('ERROR: GET /api/backup no está soportado (solo existe POST) → 404', async () => {
    expectEnvelope(await request(app).get('/api/backup'), 404);
  });
});

describe('DELETE /api/reset', () => {
  test('vacía productos y categorías', async () => {
    crearCategoria('A');
    crearProducto('P', 1, 1, 1);
    const res = await request(app).delete('/api/reset');
    expectEnvelope(res, 200);
    expect(res.body.data.mensaje).toMatch(/vaciada/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM productos').get().n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM categorias').get().n).toBe(0);
  });

  test('es idempotente: con la BD ya vacía sigue respondiendo 200', async () => {
    expectEnvelope(await request(app).delete('/api/reset'), 200);
    expectEnvelope(await request(app).delete('/api/reset'), 200);
  });
});

describe('Errores generales del cliente', () => {
  test('ERROR: ruta inexistente → 404 con formato { statusCode, data }', async () => {
    const res = await request(app).get('/api/no-existe');
    expectEnvelope(res, 404);
    expect(res.body.data.mensaje).toMatch(/Ruta no encontrada/);
  });

  test('ERROR: método no soportado (PATCH) → 404 con formato { statusCode, data }', async () => {
    const res = await request(app).patch('/api/categorias/1').send({ nombre: 'x' });
    expectEnvelope(res, 404);
  });

  test('ERROR: POST sobre una ruta de solo lectura (/api/categorias/1) → 404', async () => {
    expectEnvelope(await request(app).post('/api/categorias/1').send({ nombre: 'x' }), 404);
  });
});

describe('Flujo completo (integración CRUD)', () => {
  test('crear categoría → crear producto → editar → listar → borrar', async () => {
    const cat = await request(app).post('/api/categorias').send({ nombre: 'Flujo' });
    expectEnvelope(cat, 201);

    const prod = await request(app)
      .post('/api/productos')
      .send({ nombre: 'Item', precio: 10, stock: 1, categoria_id: cat.body.data.id });
    expectEnvelope(prod, 201);

    const upd = await request(app)
      .put(`/api/productos/${prod.body.data.id}`)
      .send({ nombre: 'Item editado', precio: 20, stock: 9, categoria_id: cat.body.data.id });
    expectEnvelope(upd, 200);

    const lista = await request(app).get('/api/productos');
    expect(lista.body.data[0]).toMatchObject({ nombre: 'Item editado', precio: 20, categoria_nombre: 'Flujo' });

    expectEnvelope(await request(app).delete(`/api/productos/${prod.body.data.id}`), 200);
    expect((await request(app).get('/api/productos')).body.data).toEqual([]);
  });
});
