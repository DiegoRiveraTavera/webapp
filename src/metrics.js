// Metricas HTTP personalizadas por endpoint, exportadas via OpenTelemetry
// hacia OpenObserve: latencia, solicitudes/segundo (contador) y tasa de
// error HTTP por endpoint + statusCode. Se registran con el MeterProvider
// global que inicializa otel.js (debe cargarse ANTES que este modulo).
const { metrics } = require('@opentelemetry/api');

const meter = metrics.getMeter('webapp-inventario');

const contadorPeticiones = meter.createCounter('http.server.requests', {
  description: 'Numero de peticiones HTTP recibidas, por metodo/ruta/statusCode',
});

const histogramaDuracion = meter.createHistogram('http.server.duration', {
  description: 'Duracion de las peticiones HTTP en milisegundos',
  unit: 'ms',
});

const contadorErrores = meter.createCounter('http.server.errors', {
  description: 'Numero de respuestas HTTP con statusCode >= 400, por endpoint',
});

function registrarMetricasRuta(req, res, next) {
  const inicio = process.hrtime.bigint();
  res.on('finish', () => {
    const duracionMs = Number(process.hrtime.bigint() - inicio) / 1e6;
    // req.route solo existe despues de que Express resuelve la ruta; si no
    // hay match (404) usamos el path crudo para no perder la metrica.
    const ruta = (req.route && req.baseUrl + req.route.path) || req.path;
    const atributos = {
      'http.method': req.method,
      'http.route': ruta,
      'http.status_code': res.statusCode,
    };
    contadorPeticiones.add(1, atributos);
    histogramaDuracion.record(duracionMs, atributos);
    if (res.statusCode >= 400) {
      contadorErrores.add(1, atributos);
    }
  });
  next();
}

module.exports = { registrarMetricasRuta, meter };
