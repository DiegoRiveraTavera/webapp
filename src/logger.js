// Logger de eventos operativos y excepciones, enviado via OpenTelemetry Logs
// (OTLP) a OpenObserve. Requiere que src/otel.js ya se haya inicializado.
const { logs, SeverityNumber } = require('@opentelemetry/api-logs');

const otelLogger = logs.getLogger('webapp-inventario');

function emitir(severityNumber, severityText, body, atributos = {}) {
  otelLogger.emit({ severityNumber, severityText, body, attributes: atributos });
  // Tambien se imprime en consola (stdout) para ver logs locales/Docker/Northflank.
  // eslint-disable-next-line no-console
  console.log(`[${severityText}] ${body}`, atributos);
}

module.exports = {
  info: (mensaje, atributos) => emitir(SeverityNumber.INFO, 'INFO', mensaje, atributos),
  warn: (mensaje, atributos) => emitir(SeverityNumber.WARN, 'WARN', mensaje, atributos),
  error: (mensaje, atributos) => emitir(SeverityNumber.ERROR, 'ERROR', mensaje, atributos),
};
