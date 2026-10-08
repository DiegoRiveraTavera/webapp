const request = require('supertest');
const app = require('../src/app');
const { resetDb, expectEnvelope, crearCategoria, crearProducto, db } = require('./helpers');

beforeEach(() => {
  resetDb();
  crearCategoria('Electrónica'); // id 1, usada por la mayoría de las pruebas
});

describe('GET /api/productos', () => {
  test('devuelve lista vacía sin productos', async () => {
    const res = await request(app).get('/api/productos');
    expectEnvelope(res, 200);
    expect(res.body.data).toEqual([]);
  });

  test('incluye el nombre de la categoría (JOIN)', async () => {
    crearProducto('Laptop', 15000, 5, 1);
    const res = await request(app).get('/api/productos');
    expectEnvelope(res, 200);
    expect(res.body.data[0]).toEqual({
      id: 1, nombre: 'Laptop', precio: 15000, stock: 5, categoria_id: 1, categoria_nombre: 'Electrónica',
    });
  });
});

describe('GET /api/productos/:id', () => {
  test('devuelve el producto solicitado', async () => {
    const id = crearProducto('Mouse', 250.5, 10, 1);
    const res = await request(app).get(`/api/productos/${id}`);
    expectEnvelope(res, 200);
    expect(res.body.data).toMatchObject({ id, nombre: 'Mouse', precio: 250.5 });
  });

  test('ERROR: 404 si no existe', async () => {
    const res = await request(app).get('/api/productos/999');
    expectEnvelope(res, 404);
  });

  test.each(['abc', '0', '-1', '2.5'])('ERROR: 400 si el id es inválido (%s)', async (badId) => {
    const res = await request(app).get(`/api/productos/${badId}`);
    expectEnvelope(res, 400);
  });
});

describe('POST /api/productos', () => {
  const valido = { nombre: 'Teclado', precio: 899.99, stock: 3, categoria_id: 1 };

  test('crea un producto y responde 201', async () => {
    const res = await request(app).post('/api/productos').send(valido);
    expectEnvelope(res, 201);
    expect(res.body.data).toEqual({ id: 1, ...valido });
  });

  test('stock es opcional y vale 0 por defecto', async () => {
    const { stock, ...sinStock } = valido;
    const res = await request(app).post('/api/productos').send(sinStock);
    expectEnvelope(res, 201);
    expect(res.body.data.stock).toBe(0);
  });

  test('acepta precio 0 (límite válido)', async () => {
    const res = await request(app).post('/api/productos').send({ ...valido, precio: 0 });
    expectEnvelope(res, 201);
  });

  test.each([
    ['sin nombre', { precio: 10, categoria_id: 1 }],
    ['sin precio', { nombre: 'X', categoria_id: 1 }],
    ['sin categoria_id', { nombre: 'X', precio: 10 }],
    ['body vacío', {}],
  ])('ERROR: 400 con campos faltantes (%s)', async (_, body) => {
    const res = await request(app).post('/api/productos').send(body);
    expectEnvelope(res, 400);
    expect(res.body.data.mensaje).toMatch(/requeridos/);
  });

  test.each([
    ['precio como texto', { ...valido, precio: 'abc' }],
    ['precio numérico en texto', { ...valido, precio: '100' }],
    ['precio negativo', { ...valido, precio: -1 }],
    ['stock negativo', { ...valido, stock: -5 }],
    ['stock decimal', { ...valido, stock: 2.5 }],
    ['stock como texto', { ...valido, stock: 'mucho' }],
    ['nombre vacío', { ...valido, nombre: '   ' }],
    ['categoria_id como texto', { ...valido, categoria_id: 'uno' }],
    ['categoria_id decimal', { ...valido, categoria_id: 1.5 }],
    ['categoria_id negativo', { ...valido, categoria_id: -1 }],
  ])('ERROR: 400 con datos inválidos (%s)', async (_, body) => {
    const res = await request(app).post('/api/productos').send(body);
    expectEnvelope(res, 400);
  });

  test('ERROR: 400 si la categoría no existe (integridad referencial)', async () => {
    const res = await request(app).post('/api/productos').send({ ...valido, categoria_id: 999 });
    expectEnvelope(res, 400);
    expect(res.body.data.mensaje).toMatch(/no existe/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM productos').get().n).toBe(0);
  });

  test('ERROR: 400 si el JSON está mal formado', async () => {
    const res = await request(app).post('/api/productos').set('Content-Type', 'application/json').send('{nombre:');
    expectEnvelope(res, 400);
  });
});

describe('PUT /api/productos/:id', () => {
  const cambios = { nombre: 'Laptop Pro', precio: 25000, stock: 2, categoria_id: 1 };

  test('actualiza todos los campos del producto', async () => {
    const id = crearProducto('Laptop', 15000, 5, 1);
    const res = await request(app).put(`/api/productos/${id}`).send(cambios);
    expectEnvelope(res, 200);
    expect(res.body.data).toEqual({ id, ...cambios });
  });

  test('permite mover el producto a otra categoría', async () => {
    const id = crearProducto('Laptop', 15000, 5, 1);
    const cat2 = crearCategoria('Oficina');
    const res = await request(app).put(`/api/productos/${id}`).send({ ...cambios, categoria_id: Number(cat2) });
    expectEnvelope(res, 200);
    expect(res.body.data.categoria_id).toBe(Number(cat2));
  });

  test('ERROR: 404 si el producto no existe', async () => {
    const res = await request(app).put('/api/productos/999').send(cambios);
    expectEnvelope(res, 404);
  });

  test('ERROR: 400 si el id es inválido', async () => {
    const res = await request(app).put('/api/productos/abc').send(cambios);
    expectEnvelope(res, 400);
  });

  test('ERROR: 400 si faltan campos requeridos', async () => {
    const id = crearProducto();
    const res = await request(app).put(`/api/productos/${id}`).send({ nombre: 'Solo nombre' });
    expectEnvelope(res, 400);
  });

  test('ERROR: 400 si el precio es inválido y no modifica el registro', async () => {
    const id = crearProducto('Laptop', 15000, 5, 1);
    const res = await request(app).put(`/api/productos/${id}`).send({ ...cambios, precio: 'gratis' });
    expectEnvelope(res, 400);
    expect(db.prepare('SELECT precio FROM productos WHERE id = ?').get(id).precio).toBe(15000);
  });

  test('ERROR: 400 si la nueva categoría no existe', async () => {
    const id = crearProducto();
    const res = await request(app).put(`/api/productos/${id}`).send({ ...cambios, categoria_id: 999 });
    expectEnvelope(res, 400);
  });
});

describe('DELETE /api/productos/:id', () => {
  test('elimina el producto y ya no se puede consultar', async () => {
    const id = crearProducto();
    const del = await request(app).delete(`/api/productos/${id}`);
    expectEnvelope(del, 200);
    expect(del.body.data).toEqual({ mensaje: 'Producto eliminado', id });
    expectEnvelope(await request(app).get(`/api/productos/${id}`), 404);
  });

  test('no elimina la categoría al borrar su producto', async () => {
    const id = crearProducto();
    await request(app).delete(`/api/productos/${id}`);
    expect(db.prepare('SELECT COUNT(*) AS n FROM categorias').get().n).toBe(1);
  });

  test('ERROR: 404 si no existe', async () => {
    expectEnvelope(await request(app).delete('/api/productos/999'), 404);
  });

  test('ERROR: 400 si el id es inválido', async () => {
    expectEnvelope(await request(app).delete('/api/productos/abc'), 400);
  });
});
