// Inicializacion de OpenTelemetry (logs + metricas + trazas) hacia OpenObserve.
//
// IMPORTANTE: este archivo se debe importar con `node -r ./src/otel.js` o
// requerirse como la PRIMERA linea de server.js, ANTES de requerir express,
// para que la instrumentacion automatica (HTTP/Express) alcance a envolver
// los modulos correctos.
//
// Variables de entorno esperadas (se configuran en Northflank, nunca en el
// codigo):
//   OTEL_EXPORTER_OTLP_ENDPOINT   -> https://<tu-instancia>.openobserve.ai/api/<org>
//   OTEL_EXPORTER_OTLP_HEADERS    -> Authorization=Basic <base64(correo:password_o_token)>
//   OTEL_SERVICE_NAME             -> webapp-inventario (opcional, default abajo)
//
// Si OTEL_EXPORTER_OTLP_ENDPOINT no esta definido, la instrumentacion se
// activa igual pero exportando a http://localhost (no falla el arranque de
// la app; simplemente no hay a donde mandar los datos todavia).

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
const { Resource } = require('@opentelemetry/resources');
const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');
const { LoggerProvider, BatchLogRecordProcessor } = require('@opentelemetry/sdk-logs');
const { logs } = require('@opentelemetry/api-logs');

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'webapp-inventario';
const BASE_URL = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

const resource = new Resource({
  [ATTR_SERVICE_NAME]: SERVICE_NAME,
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '1.1.0',
  'deployment.environment': process.env.NODE_ENV || 'production',
});

const traceExporter = new OTLPTraceExporter({ url: `${BASE_URL}/v1/traces` });
const metricExporter = new OTLPMetricExporter({ url: `${BASE_URL}/v1/metrics` });
const logExporter = new OTLPLogExporter({ url: `${BASE_URL}/v1/logs` });

// --- Logs: LoggerProvider global, usado por src/logger.js ---
const loggerProvider = new LoggerProvider({ resource });
loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));
logs.setGlobalLoggerProvider(loggerProvider);

const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 15000,
  }),
  instrumentations: [getNodeAutoInstrumentations({
    // Evita ruido de instrumentaciones de filesystem (muy verboso para una app pequena)
    '@opentelemetry/instrumentation-fs': { enabled: false },
  })],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});

module.exports = { sdk, loggerProvider };
