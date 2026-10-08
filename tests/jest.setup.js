// Se ejecuta ANTES de cargar cualquier módulo de prueba:
// usa una BD en memoria y una carpeta temporal para los backups.
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DB_FILE = ':memory:';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'inventario-test-'));
