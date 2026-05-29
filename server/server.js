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

// Serve static files from the uploads directory (allows downloading files)
app.use('/uploads', express.static(path.join(__dirname, UPLOAD_DIR)));

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

// Check if Google Drive is authorized
app.get('/api/auth/status', async (req, res) => {
  try {
    const authorized = await googleDriveService.isAuthorized();
    res.json({ authorized });
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

// OAuth Callback handler
app.get('/api/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Authorization code missing.');
  }

  try {
    await googleDriveService.saveTokensFromCode(code);
    
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
          <p>Assalamu Alaikum, Mr. Shakil Ahmad. Your Google Drive has been successfully connected to your document hub. You can close this window now.</p>
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

  let sql = 'SELECT * FROM documents WHERE 1=1';
  const params = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }

  if (month && year) {
    // Match date starting with YYYY-MM
    sql += " AND date LIKE ?";
    params.push(`${year}-${month}%`);
  } else if (year) {
    // Match date starting with YYYY
    sql += " AND date LIKE ?";
    params.push(`${year}%`);
  } else if (month) {
    // Match date containing -MM-
    sql += " AND date LIKE ?";
    params.push(`%-${month}-%`);
  }

  sql += ' ORDER BY date DESC, id DESC';

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
    // Create friendly file name for local and drive storage: YYYY-MM-DD_Category.pdf
    const formattedDate = date.replace(/-/g, '_');
    let friendlyName = `${date}_${category}.pdf`;
    
    if (category === 'salary_slip' && amount) {
      friendlyName = `${date}_Salary_Slip_${amount}.pdf`;
    } else if (category === 'ot' || category === 'mileage') {
      try {
        const endDate = new Date(date);
        if (!isNaN(endDate.getTime())) {
          const startDate = new Date(endDate);
          startDate.setDate(endDate.getDate() - 14);
          
          const formatYMD = (d) => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
          };
          
          const startDateStr = formatYMD(startDate);
          
          if (category === 'ot') {
            friendlyName = `${startDateStr}_to_${date}_OT_${hours || 0}hrs.pdf`;
          } else {
            friendlyName = `${startDateStr}_to_${date}_Mileage_${miles || 0}miles.pdf`;
          }
        }
      } catch (dateErr) {
        console.error('Failed to calculate 15-day range, using fallback:', dateErr.message);
        if (category === 'ot') friendlyName = `${date}_OT_${hours || 0}hrs.pdf`;
        if (category === 'mileage') friendlyName = `${date}_Mileage_${miles || 0}miles.pdf`;
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

// Delete document (removes from database and local storage. Google Drive deletion can be left intact or optionally removed)
app.delete('/api/documents/:id', async (req, res) => {
  const docId = req.params.id;

  try {
    const doc = await dbGet('SELECT * FROM documents WHERE id = ?', [docId]);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    // Delete local file
    if (fs.existsSync(doc.file_path)) {
      fs.unlinkSync(doc.file_path);
    }

    // Delete database entry
    await dbRun('DELETE FROM documents WHERE id = ?', [docId]);

    res.json({ success: true, message: 'Document deleted successfully from device.' });
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
});
