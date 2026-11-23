// Helpers compartidos por las paginas del frontend.
function getToken() {
  return localStorage.getItem('token');
}
function getUsuario() {
  try { return JSON.parse(localStorage.getItem('usuario') || 'null'); } catch { return null; }
}
function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.href = '/index.html';
}
function exigirSesion() {
  if (!getToken()) {
    window.location.href = '/index.html';
  }
}
async function apiFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
function montarBarra(activo) {
  const usuario = getUsuario();
  const barra = document.getElementById('barra');
  if (!barra) return;
  barra.innerHTML = `
    <strong>Inventario UTEQ</strong>
    <a href="/productos.html" ${activo === 'productos' ? 'class="activo"' : ''}>Productos</a>
    ${usuario && usuario.rol === 'admin' ? `<a href="/usuarios.html" ${activo === 'usuarios' ? 'class="activo"' : ''}>Usuarios</a>` : ''}
    <span id="usuario-actual">${usuario ? usuario.username + ' (' + usuario.rol + ')' : ''}</span>
    <button id="btn-logout">Cerrar sesion</button>
  `;
  document.getElementById('btn-logout').addEventListener('click', cerrarSesion);
}
