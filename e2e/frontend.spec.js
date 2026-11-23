// Pruebas E2E con Playwright - FRONTEND (navegador real) + BACKEND (API).
// Estas pruebas son el "gate" que debe pasar antes de desplegar: si fallan,
// el job "deploy" del pipeline de GitHub Actions no se ejecuta (ver
// .github/workflows/main.yml).
const { test, expect } = require('@playwright/test');

test.describe('Login (frontend)', () => {
  test('con credenciales correctas entra al panel de productos', async ({ page }) => {
    await page.goto('/index.html');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'admin123');
    await page.click('button[type=submit]');
    await expect(page).toHaveURL(/productos\.html/);
    await expect(page.locator('#usuario-actual')).toContainText('admin');
  });

  test('ERROR de usuario: credenciales incorrectas muestra mensaje y no navega', async ({ page }) => {
    await page.goto('/index.html');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'password-incorrecta');
    await page.click('button[type=submit]');
    await expect(page.locator('#mensaje')).toHaveText(/incorrect/i);
    await expect(page).toHaveURL(/index\.html/);
  });

  test('ERROR de usuario: intenta entrar a productos.html sin sesion y es redirigido al login', async ({ page, context }) => {
    await context.clearCookies();
    await page.addInitScript(() => localStorage.clear());
    await page.goto('/productos.html');
    await expect(page).toHaveURL(/index\.html/);
  });
});

async function login(page, username = 'admin', password = 'admin123') {
  await page.goto('/index.html');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/productos\.html/);
}

test.describe('CRUD de productos (frontend)', () => {
  test('crea una categoria y un producto, y ambos aparecen en la tabla', async ({ page }) => {
    await login(page);

    await page.fill('#cat-nombre', 'Electronica E2E');
    await page.click('text=Agregar categoria');
    await expect(page.locator('#mensaje')).toHaveText(/creada/i);

    await page.fill('#prod-nombre', 'Laptop E2E');
    await page.fill('#prod-precio', '999.99');
    await page.fill('#prod-stock', '5');
    await page.selectOption('#prod-categoria', { label: 'Electronica E2E' });
    await page.click('text=Agregar producto');

    await expect(page.locator('#cuerpo-productos')).toContainText('Laptop E2E');
    await expect(page.locator('#cuerpo-productos')).toContainText('Electronica E2E');
  });

  test('ERROR de usuario: precio negativo no crea el producto', async ({ page }) => {
    await login(page);
    await page.fill('#cat-nombre', 'Categoria Precio Invalido');
    await page.click('text=Agregar categoria');
    await page.waitForSelector('#prod-categoria option', { state: 'attached' });

    await page.fill('#prod-nombre', 'Producto Invalido');
    await page.fill('#prod-precio', '-50');
    await page.click('text=Agregar producto');

    await expect(page.locator('#mensaje')).toHaveClass(/error/);
    await expect(page.locator('#cuerpo-productos')).not.toContainText('Producto Invalido');
  });

  test('elimina un producto de la tabla', async ({ page }) => {
    await login(page);
    await page.fill('#cat-nombre', 'Categoria Para Borrar');
    await page.click('text=Agregar categoria');
    await page.fill('#prod-nombre', 'Producto A Borrar');
    await page.fill('#prod-precio', '10');
    await page.selectOption('#prod-categoria', { label: 'Categoria Para Borrar' });
    await page.click('text=Agregar producto');
    await expect(page.locator('#cuerpo-productos')).toContainText('Producto A Borrar');

    await page.click('tr:has-text("Producto A Borrar") .btn-eliminar');
    await expect(page.locator('#cuerpo-productos')).not.toContainText('Producto A Borrar');
  });
});

test.describe('CRUD de usuarios (frontend, solo admin)', () => {
  test('el admin crea un usuario operador y lo ve en la tabla', async ({ page }) => {
    await login(page);
    await page.goto('/usuarios.html');

    await page.fill('#u-username', 'operador-e2e');
    await page.fill('#u-password', '123456');
    await page.selectOption('#u-rol', 'operador');
    await page.click('text=Crear usuario');

    await expect(page.locator('#cuerpo-usuarios')).toContainText('operador-e2e');
  });

  test('ERROR de usuario: un operador no puede ver la pagina de usuarios', async ({ page, request }) => {
    // crea el operador por API para no depender del orden de ejecucion de pruebas
    const loginAdmin = await request.post('/api/login', { data: { username: 'admin', password: 'admin123' } });
    const { token } = (await loginAdmin.json()).data;
    await request.post('/api/usuarios', {
      headers: { Authorization: `Bearer ${token}` },
      data: { username: 'operador-sin-acceso', password: '123456', rol: 'operador' },
    });

    await page.goto('/index.html');
    await page.fill('#username', 'operador-sin-acceso');
    await page.fill('#password', '123456');
    await page.click('button[type=submit]');
    await expect(page).toHaveURL(/productos\.html/);
    await page.goto('/usuarios.html');

    await expect(page.locator('#mensaje')).toHaveText(/solo un administrador/i);
  });
});
