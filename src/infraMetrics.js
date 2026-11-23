// Metricas de recursos del servidor (CPU, RAM, ancho de banda aproximado)
// para el dashboard de observabilidad de infraestructura en OpenObserve.
//
// Nota: el contenedor corre en Northflank (PaaS administrado), que no
// expone sensores de temperatura de hardware como lo haria un servidor
// fisico/Raspberry Pi; por eso aqui se reportan CPU, RAM y bytes de
// red (bandwidth aproximado via los bytes de entrada/salida HTTP), que son
// las metricas de infraestructura que SI son observables desde dentro del
// contenedor. Esto se documenta tambien en el reporte de la practica.
const os = require('os');
const { metrics } = require('@opentelemetry/api');

const meter = metrics.getMeter('webapp-inventario-infra');

let bytesEntrada = 0;
let bytesSalida = 0;

meter.createObservableGauge('system.cpu.load_percent', {
  description: 'Carga de CPU promedio (1 minuto), como % sobre el numero de nucleos',
}).addCallback((result) => {
  const [carga1min] = os.loadavg();
  const pct = (carga1min / os.cpus().length) * 100;
  result.observe(pct);
});

meter.createObservableGauge('system.memory.used_percent', {
  description: 'Porcentaje de RAM usada en el contenedor/host',
}).addCallback((result) => {
  const total = os.totalmem();
  const libre = os.freemem();
  result.observe(((total - libre) / total) * 100);
});

meter.createObservableGauge('system.memory.used_bytes', {
  description: 'RAM usada en bytes',
}).addCallback((result) => {
  result.observe(os.totalmem() - os.freemem());
});

const contadorBandwidth = meter.createCounter('system.network.bytes', {
  description: 'Bytes aproximados de trafico HTTP de entrada/salida (bandwidth)',
});

// Middleware opcional para acumular bytes por peticion/respuesta.
function registrarBandwidth(req, res, next) {
  const bytesReq = Number(req.headers['content-length'] || 0);
  bytesEntrada += bytesReq;
  contadorBandwidth.add(bytesReq, { direction: 'in' });

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  let bytesRes = 0;
  res.write = (chunk, ...args) => {
    if (chunk) bytesRes += Buffer.byteLength(chunk);
    return originalWrite(chunk, ...args);
  };
  res.end = (chunk, ...args) => {
    if (chunk) bytesRes += Buffer.byteLength(chunk);
    bytesSalida += bytesRes;
    contadorBandwidth.add(bytesRes, { direction: 'out' });
    return originalEnd(chunk, ...args);
  };
  next();
}

module.exports = { registrarBandwidth };
