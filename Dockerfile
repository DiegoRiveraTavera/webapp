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

# Copiar el resto del codigo fuente
COPY src ./src

# Puerto en el que escucha la API dentro del contenedor
ENV PORT=80
EXPOSE 80 6061

# Volumen para persistir la base de datos SQLite fuera del contenedor (opcional)
VOLUME ["/app/data"]

CMD ["node", "src/server.js"]
