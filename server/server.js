const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const { dbAll, dbRun, dbGet } = require('./database');
const googleDriveService = require('./googleDriveService');

const app = express();
const PORT = process.env.PORT || 5000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(`Created local upload directory at: ${UPLOAD_DIR}`);
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Custom file serving with automatic real-time Google Drive streaming fallback
app.get('/uploads/:filename', async (req, res) => {
  const filename = req.params.filename;
  const localPath = path.join(__dirname, UPLOAD_DIR, filename);

  // 1. If the file exists physically on Render's local disk, serve it instantly!
  if (fs.existsSync(localPath)) {
    return res.sendFile(localPath);
  }

  // 2. If the file does not exist locally (e.g. disk was wiped), auto-stream from Google Drive!
  try {
    console.log(`Local file "${filename}" is missing. Scanning database for cloud backups...`);
    const doc = await dbGet(
      "SELECT * FROM documents WHERE file_name = ? OR file_path LIKE ?",
      [filename, `%/${filename}`]
    );

    if (doc && doc.google_drive_id) {
      console.log(`Auto-healing: streaming Doc #${doc.id} ("${doc.file_name}") directly from Google Drive...`);
      const isDriveAuthorized = await googleDriveService.isAuthorized();
      if (isDriveAuthorized) {
        const stream = await googleDriveService.downloadFileStreamFromDrive(doc.google_drive_id);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
        
        stream
          .on('error', (streamErr) => {
            console.error('Error during Google Drive inline stream:', streamErr.message);
            res.status(500).send('Error streaming document from cloud.');
          })
          .pipe(res);
        return;
      }
    }
  } catch (error) {
    console.error('Auto-healing file stream failed:', error.message);
  }

  // 3. Absolute Fallback: Not found
  res.status(404).send(`Cannot GET /uploads/${filename}`);
});

// Setup Multer for file uploading
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Save file with original name and timestamp to avoid collisions
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Only accept PDFs
    if (file.mimetype === 'application/pdf' || path.extname(file.originalname).toLowerCase() === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  }
});

// --- GOOGLE DRIVE AUTH ENDPOINTS ---

// --- AUTOMATIC BACKGROUND SYNC SWEEP SYSTEM ---
async function syncAllUnsyncedDocuments() {
  console.log('Starting automatic background sync sweep for unsynced documents...');
  try {
    const isDriveAuthorized = await googleDriveService.isAuthorized();
    if (!isDriveAuthorized) {
      console.log('Automatic sync sweep skipped: Google Drive is not connected.');
      return;
    }

    // Retrieve all documents that are currently local-only
    const unsyncedDocs = await dbAll("SELECT * FROM documents WHERE google_drive_id IS NULL OR google_drive_id = ''");
    if (unsyncedDocs.length === 0) {
      console.log('Automatic sync sweep completed: No unsynced documents found.');
      return;
    }

    console.log(`Found ${unsyncedDocs.length} unsynced documents. Commencing background cloud sync...`);
    
    // Sync sequentially in the background to avoid rate limits or CPU spikes on Render
    for (const doc of unsyncedDocs) {
      try {
        if (fs.existsSync(doc.file_path)) {
          console.log(`Auto-syncing Doc #${doc.id} ("${doc.file_name}") to Google Drive...`);
          const uploadResult = await googleDriveService.uploadToDrive(doc.file_path, doc.file_name, doc.category);
          
          await dbRun('UPDATE documents SET google_drive_id = ? WHERE id = ?', [uploadResult.id, doc.id]);
          console.log(`Doc #${doc.id} auto-synced successfully to Drive!`);
        } else {
          console.warn(`Local source file for Doc #${doc.id} is missing. Skipping auto-sync.`);
        }
      } catch (docErr) {
        console.error(`Failed to auto-sync Doc #${doc.id}:`, docErr.message);
      }
    }
    console.log('Background automatic sync sweep completed.');
  } catch (err) {
    console.error('Error during automatic background sync sweep:', err.message);
  }
}

// Check if Google Drive is authorized
app.get('/api/auth/status', async (req, res) => {
  try {
    const authorized = await googleDriveService.isAuthorized();
    let email = null;
    if (authorized) {
      email = await googleDriveService.getConnectedUserEmail();
      // Safely kick off background sweep asynchronously so the status page loads instantly
      syncAllUnsyncedDocuments().catch(err => console.error('Auto-sync status sweep error:', err.message));
    }
    res.json({ authorized, email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get authorization URL
app.get('/api/auth/url', (req, res) => {
  try {
    const url = googleDriveService.getAuthUrl();
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export current Google Drive OAuth tokens for browser localStorage backup
app.get('/api/auth/export', async (req, res) => {
  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'google_tokens'");
    if (row) {
      res.json({ tokens: JSON.parse(row.value) });
    } else {
      res.status(404).json({ error: 'No tokens found.' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Import Google Drive OAuth tokens from browser localStorage backup to self-heal connection
app.post('/api/auth/import', async (req, res) => {
  const { tokens } = req.body;
  if (!tokens) {
    return res.status(400).json({ error: 'Tokens are required.' });
  }
  try {
    await dbRun(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      ['google_tokens', JSON.stringify(tokens)]
    );
    
    // Asynchronously sweep and sync files immediately from Drive
    googleDriveService.fetchAndSyncAllFilesFromDrive().catch(err => console.error('Import sweep error:', err.message));
    
    res.json({ success: true, message: 'OAuth tokens imported and connection self-healed!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// OAuth Callback handler
app.get('/api/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Authorization code missing.');
  }

  try {
    await googleDriveService.saveTokensFromCode(code);
    
    // Safely trigger background sweep immediately after successful connection
    syncAllUnsyncedDocuments().catch(err => console.error('Callback auto-sync error:', err.message));
    
    // Serve a beautiful success page to your dad on his phone browser
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connection Successful</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f4f7f6;
            color: #333;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.08);
            text-align: center;
            max-width: 400px;
            width: 90%;
          }
          .icon {
            font-size: 60px;
            color: #2ecc71;
            margin-bottom: 20px;
          }
          h1 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 24px;
          }
          p {
            color: #7f8c8d;
            font-size: 16px;
            line-height: 1.5;
            margin-bottom: 30px;
          }
          .btn {
            background-color: #3498db;
            color: white;
            border: none;
            padding: 12px 30px;
            font-size: 16px;
            border-radius: 30px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✓</div>
          <h1>Successfully Connected!</h1>
          <p>Assalamu Alaikum, Mr. Shakil Ahmad. Your Google Drive has been successfully connected to your document hub.</p>
          <a href="https://msa-psi-sooty.vercel.app/" class="btn" style="background: linear-gradient(135deg, #E67E22, #D35400); box-shadow: 0 4px 15px rgba(211, 84, 0, 0.2); font-weight: bold; font-family: 'Segoe UI', sans-serif;">Go back to Document Hub</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    res.status(500).send(`Error authenticating: ${error.message}`);
  }
});

// --- DOCUMENT LOGISTICS ENDPOINTS ---

// Fetch document listings with category/date filters
app.get('/api/documents', async (req, res) => {
  const { category, month, year } = req.query;

  try {
    // Dynamically auto-recover and import any files from Google Drive in real-time
    const isDriveAuthorized = await googleDriveService.isAuthorized();
    if (isDriveAuthorized) {
      await googleDriveService.fetchAndSyncAllFilesFromDrive();
    }
  } catch (syncErr) {
    console.error('Real-time Google Drive sync sweep failed:', syncErr.message);
  }

  // Deduplicate: Select only the latest file (highest ID) if there are multiple documents with the same date
  let sql = `
    SELECT * FROM documents d1 
    WHERE d1.id = (
      SELECT MAX(d2.id) 
      FROM documents d2 
      WHERE d2.category = d1.category AND d2.date = d1.date
    )
  `;
  const params = [];

  if (category) {
    sql += ' AND d1.category = ?';
    params.push(category);
  }

  if (month && year) {
    // Match date starting with YYYY-MM
    sql += " AND d1.date LIKE ?";
    params.push(`${year}-${month}%`);
  } else if (year) {
    // Match date starting with YYYY
    sql += " AND d1.date LIKE ?";
    params.push(`${year}%`);
  } else if (month) {
    // Match date containing -MM-
    sql += " AND d1.date LIKE ?";
    params.push(`%-${month}-%`);
  }

  sql += ' ORDER BY d1.date ASC, d1.id ASC';

  try {
    const documents = await dbAll(sql, params);
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload and categorize a new document (Multi-stage Save: Local Disk + SQLite + Google Drive)
app.post('/api/documents/upload', upload.single('pdf'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Please upload a PDF file.' });
  }

  const { category, date, amount, hours, miles } = req.body;

  if (!category || !date) {
    // Delete uploaded file if metadata is missing
    fs.unlinkSync(file.path);
    return res.status(400).json({ error: 'Category and Date are required fields.' });
  }

  try {
    const formattedDate = date.replace(/-/g, '_');
    let friendlyName = `${date}_${category}.pdf`;

    // Helper to get Month_Year string (e.g. May_2026)
    const monthNames = [
      "January", "February", "March", "April", "May", "June", 
      "July", "August", "September", "October", "November", "December"
    ];
    let monthYearStr = formattedDate;
    try {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        monthYearStr = `${monthNames[d.getMonth()]}_${d.getFullYear()}`;
      }
    } catch (e) {
      console.error('Date parsing failed:', e);
    }
    
    if (category === 'salary_slip') {
      friendlyName = `${monthYearStr}_Salary_Slip_${amount || 0}.pdf`;
    } else if (category === 'mileage') {
      friendlyName = `${monthYearStr}_Mileage_${miles || 0}miles.pdf`;
    } else if (category === 'ot') {
      try {
        const endDate = new Date(date);
        if (!isNaN(endDate.getTime())) {
          const startDate = new Date(endDate);
          startDate.setDate(endDate.getDate() - 13);
          
          const monthsShort = [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
            "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
          ];
          
          const formatReadable = (d) => {
            const day = String(d.getDate()).padStart(2, '0');
            const month = monthsShort[d.getMonth()];
            return `${day}_${month}`;
          };
          
          const startStr = formatReadable(startDate);
          const endStr = formatReadable(endDate);
          const year = endDate.getFullYear();
          
          friendlyName = `${startStr}_to_${endStr}_${year}_OT_${hours || 0}hrs.pdf`;
        }
      } catch (dateErr) {
        console.error('Failed to calculate 15-day range, using fallback:', dateErr.message);
        friendlyName = `${date}_OT_${hours || 0}hrs.pdf`;
      }
    } else if (category === 'itr') {
      try {
        const d = new Date(date);
        if (!isNaN(d.getTime())) {
          const startingYear = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
          const endingYear = startingYear + 1;
          const shortStart = String(startingYear).slice(-2);
          friendlyName = `${shortStart}-${endingYear}_ITR_Projection.pdf`;
        }
      } catch (dateErr) {
        console.error('Failed to calculate ITR financial year, using fallback:', dateErr.message);
        friendlyName = `${date}_ITR_Projection.pdf`;
      }
    }

    // 1. Insert into local SQLite database first
    const insertSql = `
      INSERT INTO documents (category, date, file_name, file_path, amount, hours, miles)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await dbRun(insertSql, [
      category,
      date,
      friendlyName,
      file.path,
      amount ? parseFloat(amount) : 0,
      hours ? parseFloat(hours) : 0,
      miles ? parseFloat(miles) : 0
    ]);

    const docId = result.id;
    let driveUploadSuccess = false;
    let googleDriveId = null;

    // 2. Check if Google Drive is authorized and attempt sync
    const isDriveAuthorized = await googleDriveService.isAuthorized();
    if (isDriveAuthorized) {
      try {
        console.log(`Starting background Google Drive upload for Document #${docId}...`);
        const uploadResult = await googleDriveService.uploadToDrive(file.path, friendlyName, category);
        googleDriveId = uploadResult.id;

        // Update database with drive ID
        await dbRun('UPDATE documents SET google_drive_id = ? WHERE id = ?', [googleDriveId, docId]);
        driveUploadSuccess = true;
      } catch (driveErr) {
        console.error('Google Drive Upload Failed (saving locally only for now):', driveErr.message);
      }
    } else {
      console.log('Google Drive is not linked yet. File saved locally only.');
    }

    res.status(201).json({
      success: true,
      message: driveUploadSuccess 
        ? 'Document uploaded successfully to device and Google Drive!' 
        : 'Document uploaded successfully to device! (Drive sync pending)',
      document: {
        id: docId,
        category,
        date,
        file_name: friendlyName,
        file_path: file.path,
        amount: amount ? parseFloat(amount) : 0,
        hours: hours ? parseFloat(hours) : 0,
        miles: miles ? parseFloat(miles) : 0,
        google_drive_id: googleDriveId,
        synced: driveUploadSuccess
      }
    });

  } catch (error) {
    console.error('Upload handling error:', error);
    // Delete file if something crashed
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
    res.status(500).json({ error: error.message });
  }
});

// Retrieve monthly statistics for analytics dashboards (Mr. Shakil's totals)
app.get('/api/dashboard/stats', async (req, res) => {
  // Query format: YYYY-MM. Defaults to current year and month.
  const now = new Date();
  const year = req.query.year || now.getFullYear().toString();
  const month = req.query.month || String(now.getMonth() + 1).padStart(2, '0');
  const datePattern = `${year}-${month}%`;

  try {
    // 1. Get sum of salary slips
    const salaryRow = await dbGet(
      "SELECT SUM(amount) as total FROM documents WHERE category = 'salary_slip' AND date LIKE ?",
      [datePattern]
    );

    // 2. Get sum of OT hours
    const otRow = await dbGet(
      "SELECT SUM(hours) as total FROM documents WHERE category = 'ot' AND date LIKE ?",
      [datePattern]
    );

    // 3. Get sum of Mileage miles
    const mileageRow = await dbGet(
      "SELECT SUM(miles) as total FROM documents WHERE category = 'mileage' AND date LIKE ?",
      [datePattern]
    );

    // 4. Get counts of documents uploaded this month
    const countRow = await dbGet(
      "SELECT COUNT(*) as total FROM documents WHERE date LIKE ?",
      [datePattern]
    );

    res.json({
      month: `${year}-${month}`,
      total_salary: salaryRow?.total || 0,
      total_ot_hours: otRow?.total || 0,
      total_mileage: mileageRow?.total || 0,
      document_count: countRow?.total || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Trigger a retry sync for files that failed or are pending drive uploads
app.post('/api/documents/:id/sync', async (req, res) => {
  const docId = req.params.id;

  try {
    const doc = await dbGet('SELECT * FROM documents WHERE id = ?', [docId]);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    if (doc.google_drive_id) {
      return res.json({ success: true, message: 'Already synced to Google Drive.', google_drive_id: doc.google_drive_id });
    }

    if (!fs.existsSync(doc.file_path)) {
      return res.status(410).json({ error: 'Local source file has been deleted. Cannot sync.' });
    }

    const isDriveAuthorized = await googleDriveService.isAuthorized();
    if (!isDriveAuthorized) {
      return res.status(400).json({ error: 'Google Drive is not authenticated.' });
    }

    console.log(`Manually syncing Document #${docId} to Google Drive...`);
    const uploadResult = await googleDriveService.uploadToDrive(doc.file_path, doc.file_name, doc.category);
    
    await dbRun('UPDATE documents SET google_drive_id = ? WHERE id = ?', [uploadResult.id, docId]);

    res.json({
      success: true,
      message: 'Successfully synced to Google Drive!',
      google_drive_id: uploadResult.id
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle receipt status of a document
app.put('/api/documents/:id/received', async (req, res) => {
  const docId = req.params.id;
  const { is_received } = req.body;

  if (is_received === undefined) {
    return res.status(400).json({ error: 'is_received parameter is required.' });
  }

  try {
    const doc = await dbGet('SELECT * FROM documents WHERE id = ?', [docId]);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    await dbRun('UPDATE documents SET is_received = ? WHERE id = ?', [
      is_received ? 1 : 0,
      docId
    ]);

    res.json({
      success: true,
      message: `Document receipt marked as ${is_received ? 'Received' : 'Pending'}!`,
      is_received: is_received ? 1 : 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete document (removes from database, local storage, and Google Drive cloud)
app.delete('/api/documents/:id', async (req, res) => {
  const docId = req.params.id;

  try {
    const doc = await dbGet('SELECT * FROM documents WHERE id = ?', [docId]);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // 1. Delete from Google Drive if synced
    if (doc.google_drive_id) {
      try {
        console.log(`Deleting file from Google Drive for Doc #${docId} (ID: ${doc.google_drive_id})...`);
        const isDriveAuthorized = await googleDriveService.isAuthorized();
        if (isDriveAuthorized) {
          await googleDriveService.deleteFromDrive(doc.google_drive_id);
        }
      } catch (driveErr) {
        console.error(`Google Drive deletion failed (continuing local deletion):`, driveErr.message);
      }
    }

    // 2. Delete local file
    if (fs.existsSync(doc.file_path)) {
      fs.unlinkSync(doc.file_path);
    }

    // 3. Delete database entry
    await dbRun('DELETE FROM documents WHERE id = ?', [docId]);

    res.json({ success: true, message: 'Document deleted successfully from device and Google Drive.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'An internal server error occurred.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
  // Safely trigger background sweep on startup to auto-sync any pending files
  syncAllUnsyncedDocuments().catch(err => console.error('Startup auto-sync sweep error:', err.message));
});
