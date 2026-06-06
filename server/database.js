const path = require('path');
const sqlite3 = require('sqlite3').verbose();

require('dotenv').config();

const isPostgres = !!process.env.DATABASE_URL;
let db = null;
let pgPool = null;

if (isPostgres) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for secure cloud DB providers like Neon / Supabase
  });
  console.log('Using PostgreSQL Cloud Database.');
  initializePostgresDatabase();
} else {
  const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'msa_hub.db');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
    } else {
      console.log('Connected to the SQLite database.');
      initializeSqliteDatabase();
    }
  });
}

// ----------------------------------------------------
// DATABASE INITIALIZATION (SQLite dialect)
// ----------------------------------------------------
function initializeSqliteDatabase() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `, (err) => {
      if (err) console.error('Error creating settings table:', err.message);
    });

    db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        amount REAL DEFAULT 0,
        hours REAL DEFAULT 0,
        miles REAL DEFAULT 0,
        google_drive_id TEXT,
        is_received INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('Error creating documents table:', err.message);
      } else {
        db.run("ALTER TABLE documents ADD COLUMN is_received INTEGER DEFAULT 0", (alterErr) => {
          // Ignore error if column already exists
        });
      }
    });
  });
}

// ----------------------------------------------------
// DATABASE INITIALIZATION (PostgreSQL dialect)
// ----------------------------------------------------
async function initializePostgresDatabase() {
  try {
    const client = await pgPool.connect();
    try {
      // 1. Settings Table
      await client.query(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `);

      // 2. Documents Table (with is_received column included)
      await client.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id SERIAL PRIMARY KEY,
          category TEXT NOT NULL,
          date TEXT NOT NULL,
          file_name TEXT NOT NULL,
          file_path TEXT NOT NULL,
          amount DOUBLE PRECISION DEFAULT 0,
          hours DOUBLE PRECISION DEFAULT 0,
          miles DOUBLE PRECISION DEFAULT 0,
          google_drive_id TEXT,
          is_received INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('PostgreSQL Tables migrated successfully.');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error migrating PostgreSQL database:', err.message);
  }
}

// ----------------------------------------------------
// DIALECT CONVERTER (SQLite to PostgreSQL translator)
// ----------------------------------------------------
function convertSqlDialect(sql) {
  let pgSql = sql;
  
  // 1. Convert SQLite INSERT OR REPLACE for settings
  if (pgSql.includes('INSERT OR REPLACE INTO settings')) {
    pgSql = 'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value';
    return pgSql;
  }

  // 2. Convert standard SQLite placeholder '?' to Postgres '$1, $2, ...'
  let index = 1;
  pgSql = pgSql.replace(/\?/g, () => `$${index++}`);
  return pgSql;
}

// ----------------------------------------------------
// EXPORTED QUERY ABSTRACTIONS
// ----------------------------------------------------
const dbRun = async (sql, params = []) => {
  if (isPostgres) {
    const pgSql = convertSqlDialect(sql);
    const result = await pgPool.query(pgSql, params);
    
    // Mimic SQLite lastID output
    let lastID = null;
    if (pgSql.trim().toUpperCase().startsWith('INSERT')) {
      try {
        const idRes = await pgPool.query('SELECT lastval()');
        lastID = idRes.rows[0]?.lastval;
      } catch (e) {
        const idRes = await pgPool.query('SELECT max(id) as max_id FROM documents');
        lastID = idRes.rows[0]?.max_id;
      }
    }
    return { id: lastID, changes: result.rowCount };
  } else {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }
};

const dbAll = async (sql, params = []) => {
  if (isPostgres) {
    const pgSql = convertSqlDialect(sql);
    const result = await pgPool.query(pgSql, params);
    return result.rows;
  } else {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

const dbGet = async (sql, params = []) => {
  if (isPostgres) {
    const pgSql = convertSqlDialect(sql);
    const result = await pgPool.query(pgSql, params);
    return result.rows[0] || null;
  } else {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
};

module.exports = {
  db,
  dbRun,
  dbAll,
  dbGet
};
