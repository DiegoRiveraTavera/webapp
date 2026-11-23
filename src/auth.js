const jwt = require('jsonwebtoken');

// En produccion este secreto debe venir de una variable de entorno/secret
// (nunca se escribe en el codigo ni en el repositorio).
const JWT_SECRET = process.env.JWT_SECRET || 'uteq-dev-secret-cambiar-en-produccion';
const JWT_EXPIRES_IN = '2h';

function generarToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, username: usuario.username, rol: usuario.rol },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Middleware: exige un Bearer token valido. Pone req.usuario si es correcto.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [tipo, token] = header.split(' ');
  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ statusCode: 401, data: { mensaje: 'Token de autenticacion requerido' } });
  }
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ statusCode: 401, data: { mensaje: 'Token invalido o expirado' } });
  }
}

// Middleware: exige que el usuario autenticado tenga rol admin.
function requireAdmin(req, res, next) {
  if (!req.usuario || req.usuario.rol !== 'admin') {
    return res.status(403).json({ statusCode: 403, data: { mensaje: 'Se requiere rol de administrador' } });
  }
  next();
}

module.exports = { generarToken, requireAuth, requireAdmin, JWT_SECRET };
