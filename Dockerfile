# =============================================================================
# Dockerfile: API de Inventario (Node.js + Express + SQLite)
# =============================================================================

FROM node:20-bookworm-slim

# Dependencias del sistema necesarias para compilar better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar solo archivos de dependencias primero (aprovecha la cache de Docker)
COPY package.json ./
RUN npm install --omit=dev

# Copiar el resto del codigo fuente (API + frontend estatico)
COPY src ./src
COPY public ./public

# Puerto en el que escucha la API REST dentro del contenedor
ENV PORT=80
EXPOSE 80

# Puerto del servidor de sockets TCP ({insert:<json>} / {get:<id>})
ENV SOCKET_PORT=6061
EXPOSE 6061

# ----------------------------------------------------------------------------
# Observabilidad (OpenTelemetry -> OpenObserve). Estos valores NO se escriben
# aqui: se configuran como variables de entorno del servicio en Northflank.
#   OTEL_EXPORTER_OTLP_ENDPOINT = https://<tu-instancia>.openobserve.ai/api/<org>
#   OTEL_EXPORTER_OTLP_HEADERS  = Authorization=Basic <base64(correo:password)>
#   OTEL_SERVICE_NAME           = webapp-inventario
#   JWT_SECRET                  = <secreto largo y aleatorio>
#   ADMIN_USERNAME / ADMIN_PASSWORD = credenciales del admin semilla
# ----------------------------------------------------------------------------

# Volumen para persistir la base de datos SQLite fuera del contenedor (opcional)
VOLUME ["/app/data"]

CMD ["node", "src/server.js"]