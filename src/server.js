// IMPORTANTE: otel.js debe requerirse PRIMERO, antes de express y de
// cualquier otro modulo, para que la instrumentacion automatica (HTTP,
// Express) pueda interceptar los modulos al cargarse.
require('./otel');

const app = require('./app');
const { DB_PATH } = require('./db');
const { iniciarServidorSockets } = require('./socketServer');
const logger = require('./logger');

const PORT = process.env.PORT || 80;
const SOCKET_PORT = process.env.SOCKET_PORT || 6061;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
  console.log(`Base de datos en: ${DB_PATH}`);
  logger.info('Servidor HTTP iniciado', { puerto: PORT });
});

// Servidor de sockets TCP (protocolo {insert:<json>} / {get:<id>}),
// corre en paralelo dentro del mismo proceso/contenedor.
iniciarServidorSockets(SOCKET_PORT);
