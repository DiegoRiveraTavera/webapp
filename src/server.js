const app = require('./app');
const { DB_PATH } = require('./db');
const { iniciarServidorSockets } = require('./socketServer');

const PORT = process.env.PORT || 80;
const SOCKET_PORT = process.env.SOCKET_PORT || 6061;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
  console.log(`Base de datos en: ${DB_PATH}`);
});

// Servidor de sockets TCP (protocolo {insert:<json>} / {get:<id>}),
// corre en paralelo dentro del mismo proceso/contenedor.
iniciarServidorSockets(SOCKET_PORT);
