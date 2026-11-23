const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// DATA_DIR y DB_FILE se pueden sobreescribir por variables de entorno
// (las pruebas usan una BD en memoria para no tocar datos reales).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'inventario.db');
const DB_PATH = DB_FILE;
const db = new Database(DB_FILE);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Esquema normalizado: categorias (1) --- (N) productos
db.exec(`
  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    categoria_id INTEGER NOT NULL,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'operador',
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Semilla: si no hay ningun usuario, crea un admin por defecto para poder
// iniciar sesion la primera vez. Password se puede sobreescribir por env.
const bcrypt = require('bcryptjs');
const existeAlguno = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
if (existeAlguno === 0) {
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(adminPass, 10);
  db.prepare('INSERT INTO usuarios (username, password_hash, rol) VALUES (?, ?, ?)')
    .run(adminUser, hash, 'admin');
}

module.exports = { db, DB_PATH, DATA_DIR };
