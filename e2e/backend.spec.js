// Pruebas E2E con Playwright - BACKEND puro (sin navegador, via request context
// de Playwright), contra el servidor real levantado por playwright.config.js.
const { test, expect } = require('@playwright/test');

async function tokenAdmin(request) {
  const res = await request.post('/api/login', { data: { username: 'admin', password: 'admin123' } });
  const body = await res.json();
  return body.data.token;
}

test.describe('Backend - flujo completo categorias/productos', () => {
  test('crea categoria y producto, los lista y los elimina', async ({ request }) => {
    const token = await tokenAdmin(request);
    const headers = { Authorization: `Bearer ${token}` };

    const cat = await request.post('/api/categorias', { headers, data: { nombre: 'Backend E2E' } });
    expect(cat.status()).toBe(201);
    const catId = (await cat.json()).data.id;

    const prod = await request.post('/api/productos', {
      headers,
      data: { nombre: 'Teclado E2E', precio: 350, stock: 20, categoria_id: catId },
    });
    expect(prod.status()).toBe(201);
    const prodId = (await prod.json()).data.id;

    const lista = await request.get('/api/productos');
    expect(lista.status()).toBe(200);
    const encontrado = (await lista.json()).data.find((p) => p.id === prodId);
    expect(encontrado.nombre).toBe('Teclado E2E');

    const del = await request.delete(`/api/productos/${prodId}`, { headers });
    expect(del.status()).toBe(200);
  });

  test('ERROR de usuario: crear producto sin token responde 401', async ({ request }) => {
    const res = await request.post('/api/productos', { data: { nombre: 'X', precio: 1, categoria_id: 1 } });
    expect(res.status()).toBe(401);
  });

  test('ERROR de usuario: crear producto con categoria_id inexistente responde 400', async ({ request }) => {
    const token = await tokenAdmin(request);
    const res = await request.post('/api/productos', {
      headers: { Authorization: `Bearer ${token}` },
      data: { nombre: 'X', precio: 1, categoria_id: 999999 },
    });
    expect(res.status()).toBe(400);
  });

  test('ERROR de usuario: login con body vacio responde 400', async ({ request }) => {
    const res = await request.post('/api/login', { data: {} });
    expect(res.status()).toBe(400);
  });
});
