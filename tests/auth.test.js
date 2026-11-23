const request = require('supertest');
const app = require('../src/app');

async function loginAdmin() {
  const res = await request(app).post('/api/login').send({ username: 'admin', password: 'admin123' });
  return res.body.data.token;
}

describe('POST /api/login', () => {
  test('con credenciales correctas devuelve un token', async () => {
    const res = await request(app).post('/api/login').send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.usuario.username).toBe('admin');
  });

  test('con password incorrecto devuelve 401', async () => {
    const res = await request(app).post('/api/login').send({ username: 'admin', password: 'incorrecta' });
    expect(res.status).toBe(401);
  });

  test('con usuario inexistente devuelve 401', async () => {
    const res = await request(app).post('/api/login').send({ username: 'no-existe', password: 'x' });
    expect(res.status).toBe(401);
  });

  test('sin password devuelve 400', async () => {
    const res = await request(app).post('/api/login').send({ username: 'admin' });
    expect(res.status).toBe(400);
  });
});

describe('CRUD /api/usuarios (protegido)', () => {
  test('sin token devuelve 401', async () => {
    const res = await request(app).get('/api/usuarios');
    expect(res.status).toBe(401);
  });

  test('con token invalido devuelve 401', async () => {
    const res = await request(app).get('/api/usuarios').set('Authorization', 'Bearer token-falso');
    expect(res.status).toBe(401);
  });

  test('admin puede crear, listar, actualizar y eliminar un usuario', async () => {
    const token = await loginAdmin();

    const crear = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'operador1', password: '123456', rol: 'operador' });
    expect(crear.status).toBe(201);
    expect(crear.body.data.password_hash).toBeUndefined();
    const id = crear.body.data.id;

    const listar = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token}`);
    expect(listar.status).toBe(200);
    expect(listar.body.data.length).toBeGreaterThanOrEqual(2);

    const actualizar = await request(app)
      .put(`/api/usuarios/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'operador1-renombrado', rol: 'operador' });
    expect(actualizar.status).toBe(200);
    expect(actualizar.body.data.username).toBe('operador1-renombrado');

    const eliminar = await request(app).delete(`/api/usuarios/${id}`).set('Authorization', `Bearer ${token}`);
    expect(eliminar.status).toBe(200);
  });

  test('crear usuario con username duplicado devuelve 409', async () => {
    const token = await loginAdmin();
    await request(app).post('/api/usuarios').set('Authorization', `Bearer ${token}`)
      .send({ username: 'duplicado', password: '123456' });
    const res = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${token}`)
      .send({ username: 'duplicado', password: '123456' });
    expect(res.status).toBe(409);
  });

  test('crear usuario con password corto devuelve 400', async () => {
    const token = await loginAdmin();
    const res = await request(app).post('/api/usuarios').set('Authorization', `Bearer ${token}`)
      .send({ username: 'corto', password: '123' });
    expect(res.status).toBe(400);
  });

  test('un operador (no admin) no puede listar usuarios', async () => {
    const token = await loginAdmin();
    await request(app).post('/api/usuarios').set('Authorization', `Bearer ${token}`)
      .send({ username: 'operador2', password: '123456', rol: 'operador' });
    const loginOp = await request(app).post('/api/login').send({ username: 'operador2', password: '123456' });
    const tokenOp = loginOp.body.data.token;

    const res = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${tokenOp}`);
    expect(res.status).toBe(403);
  });

  test('eliminar usuario inexistente devuelve 404', async () => {
    const token = await loginAdmin();
    const res = await request(app).delete('/api/usuarios/9999').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('Escritura en categorias/productos requiere autenticacion', () => {
  test('POST /api/categorias sin token devuelve 401', async () => {
    const res = await request(app).post('/api/categorias').send({ nombre: 'Sin sesion' });
    expect(res.status).toBe(401);
  });

  test('POST /api/categorias con token valido funciona', async () => {
    const token = await loginAdmin();
    const res = await request(app).post('/api/categorias').set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Con sesion' });
    expect(res.status).toBe(201);
  });
});
