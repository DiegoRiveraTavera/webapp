# WebApp – API de Inventario con pipeline CI/CD

API REST de inventario (categorías y productos) construida con **Node.js, Express y SQLite**, con pruebas automatizadas (Jest + Supertest), contenerización con Docker, integración continua con **GitHub Actions**, publicación de imágenes en **Docker Hub** y despliegue continuo en **Northflank** (alternativa a AWS EC2).

## Arquitectura

```
 git push (main)
      │
      ▼
┌──────────────────────── GitHub Actions ────────────────────────┐
│  1. test    →  npm ci + jest --coverage (umbral 70 %)           │
│  2. docker  →  build + push  :latest  y  :<sha del commit>      │
│  3. deploy  →  Northflank actualiza el servicio con :<sha>      │
└──────────────────────────────────────────────────────────────────┘
      │ (push)                              │ (deploy)
      ▼                                     ▼
  Docker Hub  ───────── pull ─────────►  Northflank (contenedor)
                                          ├─ API REST  :80
                                          └─ Socket TCP :6061
```

## Estructura del proyecto

```
src/
  app.js            Rutas de la API (Express)
  db.js             Conexión y esquema SQLite
  server.js         Arranque: API REST + servidor TCP
  socketServer.js   Protocolo TCP {insert:<json>} / {get:<id>}
tests/              Pruebas unitarias/integración (Jest + Supertest)
Dockerfile
.dockerignore
.github/workflows/main.yml
```

## Comandos locales

```bash
npm install                # instalar dependencias
npm start                  # API en el puerto 80 (PORT=3000 npm start para otro puerto)
npm test                   # pruebas
npm run test:coverage      # pruebas + cobertura (falla si < 70 %)

# Docker
docker build -t webapp:latest .
docker run -d -p 8080:80 -p 6061:6061 --name webapp-container webapp:latest
curl http://localhost:8080/
```

## Protocolo TCP (puerto 6061)

```
{insert:{"nombre":"Amarillo","precio":450,"stock":8,"categoria_id":1}}
{get:5}
```

Cada mensaje termina en salto de línea y la respuesta usa el mismo esquema `{ statusCode, data }` de la API REST.

## Configuración del pipeline

### 1. Docker Hub

Crear un Personal Access Token en Account settings → Personal access tokens, con permisos *Read & Write*.

### 2. Northflank

1. Crear un proyecto (`webapp-devops`) y un **deployment service** (`webapp-api`) que use la imagen externa `<usuario>/webapp:latest` de Docker Hub.
2. Exponer el puerto **80** (HTTP, público). Opcional: puerto **6061** (TCP).
3. Crear un token de API en Team settings → API → Tokens, con permiso para desplegar.
4. Si los IDs del proyecto o servicio son distintos, ajustar `NF_PROJECT_ID` y `NF_SERVICE_ID` en `.github/workflows/main.yml`.

### 3. Secrets en GitHub

En Settings → Secrets and variables → Actions → pestaña **Secrets**:

| Secret | Contenido |
|---|---|
| `DOCKERHUB_USERNAME` | Usuario de Docker Hub |
| `DOCKERHUB_TOKEN` | Personal Access Token de Docker Hub |
| `NORTHFLANK_API_KEY` | Token de API de Northflank |

> No se guarda ninguna contraseña, token, IP o llave en el código. Todo dato sensible vive en GitHub Secrets.

### 4. Flujo del workflow

| Evento | Jobs que corren |
|---|---|
| `pull_request` a `main` | `test` |
| `push` a `main` | `test` → `docker` → `deploy` |

## Demostración en vivo

1. Cambiar el mensaje de `GET /` en `src/app.js`.
2. `git add . && git commit -m "demo" && git push origin main`.
3. Revisar la pestaña **Actions**: pruebas → imagen en Docker Hub (`:latest` y `:<sha>`) → despliegue.
4. Comprobar el cambio en la URL pública de Northflank.