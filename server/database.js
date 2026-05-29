const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'msa_hub.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    initializeDatabase();
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // 1. Settings Table (to store OAuth credentials dynamically)
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `, (err) => {
      if (err) console.error('Error creating settings table:', err.message);
    });

    // 2. Documents Table (to store metadata and file paths)
    db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,       -- 'salary_slip', 'ot', 'mileage'
        date TEXT NOT NULL,           -- YYYY-MM-DD
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        amount REAL DEFAULT 0,        -- Net salary (optional)
        hours REAL DEFAULT 0,         -- Overtime hours (optional)
        miles REAL DEFAULT 0,         -- Mileage miles (optional)
        google_drive_id TEXT,         -- Google Drive uploaded file ID
        is_received INTEGER DEFAULT 0, -- 0 = Pending, 1 = Received
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        console.error('Error creating documents table:', err.message);
      } else {
        // Run migration to add column if database already existed
        db.run("ALTER TABLE documents ADD COLUMN is_received INTEGER DEFAULT 0", (alterErr) => {
          // Suppress error if column already exists
        });
      }
    });
  });
}

// Helper methods for async database operations
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

module.exports = {
  db,
  dbRun,
  dbAll,
  dbGet
};
