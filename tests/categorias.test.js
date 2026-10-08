const request = require('supertest');
const app = require('../src/app');
const { resetDb, expectEnvelope, crearCategoria, crearProducto, db } = require('./helpers');

beforeEach(resetDb);

describe('GET /api/categorias', () => {
  test('devuelve lista vacía cuando no hay datos', async () => {
    const res = await request(app).get('/api/categorias');
    expectEnvelope(res, 200);
    expect(res.body.data).toEqual([]);
  });

  test('devuelve todas las categorías registradas', async () => {
    crearCategoria('Electrónica', 'Gadgets');
    crearCategoria('Ropa');
    const res = await request(app).get('/api/categorias');
    expectEnvelope(res, 200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toEqual({ id: 1, nombre: 'Electrónica', descripcion: 'Gadgets' });
  });
});

describe('GET /api/categorias/:id', () => {
  test('devuelve la categoría solicitada', async () => {
    const id = crearCategoria('Hogar', 'Casa');
    const res = await request(app).get(`/api/categorias/${id}`);
    expectEnvelope(res, 200);
    expect(res.body.data).toMatchObject({ id, nombre: 'Hogar' });
  });

  test('ERROR: 404 si la categoría no existe', async () => {
    const res = await request(app).get('/api/categorias/999');
    expectEnvelope(res, 404);
    expect(res.body.data.mensaje).toMatch(/no encontrada/i);
  });

  test.each(['abc', '0', '-5', '1.5', '1;DROP'])('ERROR: 400 si el id es inválido (%s)', async (badId) => {
    const res = await request(app).get(`/api/categorias/${encodeURIComponent(badId)}`);
    expectEnvelope(res, 400);
  });
});

describe('POST /api/categorias', () => {
  test('crea una categoría y responde 201', async () => {
    const res = await request(app).post('/api/categorias').send({ nombre: 'Juguetes', descripcion: 'Niños' });
    expectEnvelope(res, 201);
    expect(res.body.data).toEqual({ id: 1, nombre: 'Juguetes', descripcion: 'Niños' });
  });

  test('descripcion es opcional y se guarda como null', async () => {
    const res = await request(app).post('/api/categorias').send({ nombre: 'Libros' });
    expectEnvelope(res, 201);
    expect(res.body.data.descripcion).toBeNull();
  });

  test('recorta espacios del nombre', async () => {
    const res = await request(app).post('/api/categorias').send({ nombre: '  Deportes  ' });
    expectEnvelope(res, 201);
    expect(res.body.data.nombre).toBe('Deportes');
  });

  test('ERROR: 400 si falta "nombre"', async () => {
    const res = await request(app).post('/api/categorias').send({ descripcion: 'sin nombre' });
    expectEnvelope(res, 400);
  });

  test('ERROR: 400 si el body está vacío', async () => {
    const res = await request(app).post('/api/categorias');
    expectEnvelope(res, 400);
  });

  test.each([['solo espacios', '   '], ['número', 123], ['arreglo', ['a']], ['objeto', { a: 1 }], ['null', null]])(
    'ERROR: 400 si "nombre" es inválido (%s)',
    async (_, valor) => {
      const res = await request(app).post('/api/categorias').send({ nombre: valor });
      expectEnvelope(res, 400);
    }
  );

  test('ERROR: 400 si el JSON está mal formado', async () => {
    const res = await request(app)
      .post('/api/categorias')
      .set('Content-Type', 'application/json')
      .send('{"nombre": "roto"');
    expectEnvelope(res, 400);
    expect(res.body.data.mensaje).toMatch(/JSON/);
  });

  test('ERROR: 409 si el nombre ya existe (UNIQUE)', async () => {
    crearCategoria('Duplicada');
    const res = await request(app).post('/api/categorias').send({ nombre: 'Duplicada' });
    expectEnvelope(res, 409);
  });
});

describe('PUT /api/categorias/:id', () => {
  test('actualiza nombre y descripción', async () => {
    const id = crearCategoria('Vieja', 'x');
    const res = await request(app).put(`/api/categorias/${id}`).send({ nombre: 'Nueva', descripcion: 'y' });
    expectEnvelope(res, 200);
    expect(res.body.data).toEqual({ id, nombre: 'Nueva', descripcion: 'y' });
    expect(db.prepare('SELECT nombre FROM categorias WHERE id = ?').get(id).nombre).toBe('Nueva');
  });

  test('permite conservar el mismo nombre (no cuenta como duplicado)', async () => {
    const id = crearCategoria('Igual');
    const res = await request(app).put(`/api/categorias/${id}`).send({ nombre: 'Igual', descripcion: 'cambio' });
    expectEnvelope(res, 200);
  });

  test('ERROR: 404 si la categoría no existe', async () => {
    const res = await request(app).put('/api/categorias/999').send({ nombre: 'X' });
    expectEnvelope(res, 404);
  });

  test('ERROR: 400 si falta "nombre"', async () => {
    const id = crearCategoria('A');
    const res = await request(app).put(`/api/categorias/${id}`).send({ descripcion: 'solo desc' });
    expectEnvelope(res, 400);
  });

  test('ERROR: 400 si el id es inválido', async () => {
    const res = await request(app).put('/api/categorias/abc').send({ nombre: 'X' });
    expectEnvelope(res, 400);
  });

  test('ERROR: 409 si el nuevo nombre pertenece a otra categoría', async () => {
    crearCategoria('Uno');
    const id2 = crearCategoria('Dos');
    const res = await request(app).put(`/api/categorias/${id2}`).send({ nombre: 'Uno' });
    expectEnvelope(res, 409);
  });
});

describe('DELETE /api/categorias/:id', () => {
  test('elimina la categoría y ya no se puede consultar', async () => {
    const id = crearCategoria('Temporal');
    const del = await request(app).delete(`/api/categorias/${id}`);
    expectEnvelope(del, 200);
    expect(del.body.data).toEqual({ mensaje: 'Categoría eliminada', id });

    const get = await request(app).get(`/api/categorias/${id}`);
    expectEnvelope(get, 404);
  });

  test('elimina en cascada los productos de la categoría', async () => {
    const id = crearCategoria('ConProductos');
    crearProducto('P1', 10, 1, id);
    crearProducto('P2', 20, 2, id);
    await request(app).delete(`/api/categorias/${id}`);
    expect(db.prepare('SELECT COUNT(*) AS n FROM productos').get().n).toBe(0);
  });

  test('ERROR: 404 si la categoría no existe', async () => {
    const res = await request(app).delete('/api/categorias/999');
    expectEnvelope(res, 404);
  });

  test('ERROR: 400 si el id es inválido', async () => {
    const res = await request(app).delete('/api/categorias/xyz');
    expectEnvelope(res, 400);
  });

  test('ERROR: borrar dos veces la misma categoría devuelve 404 la segunda vez', async () => {
    const id = crearCategoria('Doble');
    expectEnvelope(await request(app).delete(`/api/categorias/${id}`), 200);
    expectEnvelope(await request(app).delete(`/api/categorias/${id}`), 404);
  });
});
