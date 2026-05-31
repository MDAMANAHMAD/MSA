const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { dbGet, dbRun, dbAll } = require('./database');

require('dotenv').config();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

// Initialize OAuth2 client
function getOAuth2Client() {
  if (CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID' || !CLIENT_ID) {
    console.warn('WARNING: Google OAuth client credentials not set in .env file!');
  }
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

// Check if credentials exist in DB
async function isAuthorized() {
  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'google_tokens'");
    return !!row;
  } catch (error) {
    console.error('Error checking authorization status:', error);
    return false;
  }
}

// Get the authorization URL
function getAuthUrl() {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Required to get refresh token
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent' // Forces consent screen to get refresh token every time we authenticate
  });
}

// Exchange Auth Code for tokens and save to DB
async function saveTokensFromCode(code) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  
  // If refresh_token is missing, check if we have an existing one to preserve
  if (!tokens.refresh_token) {
    const existing = await dbGet("SELECT value FROM settings WHERE key = 'google_tokens'");
    if (existing) {
      const existingTokens = JSON.parse(existing.value);
      tokens.refresh_token = existingTokens.refresh_token;
    }
  }

  await dbRun(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    ['google_tokens', JSON.stringify(tokens)]
  );
  return tokens;
}

// Get authenticated client instance
async function getAuthenticatedClient() {
  const oauth2Client = getOAuth2Client();
  const row = await dbGet("SELECT value FROM settings WHERE key = 'google_tokens'");
  
  if (!row) {
    throw new Error('Google Drive is not authenticated. Please log in first.');
  }

  const tokens = JSON.parse(row.value);
  oauth2Client.setCredentials(tokens);

  // Monitor token refreshing to update database
  oauth2Client.on('tokens', async (newTokens) => {
    console.log('Google Access Token refreshed.');
    const updatedTokens = { ...tokens, ...newTokens };
    await dbRun(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
      ['google_tokens', JSON.stringify(updatedTokens)]
    );
  });

  return oauth2Client;
}

// Find folder or create it if not exists
async function getOrCreateFolder(drive, folderName, parentId = null) {
  let query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`;
  if (parentId) {
    query += ` and '${parentId}' in parents`;
  }

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }

  // Create folder
  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    fileMetadata.parents = [parentId];
  }

  const folder = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
  });

  console.log(`Created folder "${folderName}" with ID ${folder.data.id}`);
  return folder.data.id;
}

// Upload file to Google Drive in organized subfolders
async function uploadToDrive(localFilePath, fileName, category) {
  const auth = await getAuthenticatedClient();
  const drive = google.drive({ version: 'v3', auth });

  // 1. Get or create root folder: "MD Shakil Ahmad - Document Hub"
  const rootFolderId = await getOrCreateFolder(drive, 'MD Shakil Ahmad - Document Hub');

  // 2. Map category to human-friendly folder names
  let folderName = 'Salary Slips';
  if (category === 'ot') folderName = 'Overtime';
  if (category === 'mileage') folderName = 'Mileage';
  if (category === 'itr') folderName = 'ITR Projections';

  // 3. Get or create category folder
  const categoryFolderId = await getOrCreateFolder(drive, folderName, rootFolderId);

  // 4. Upload file
  const fileMetadata = {
    name: fileName,
    parents: [categoryFolderId],
  };

  const media = {
    mimeType: 'application/pdf',
    body: fs.createReadStream(localFilePath),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, webViewLink',
  });

  console.log(`Successfully uploaded file "${fileName}" with Google Drive ID ${response.data.id}`);
  return {
    id: response.data.id,
    webViewLink: response.data.webViewLink
  };
}

// Get connected user email address
async function getConnectedUserEmail() {
  try {
    const auth = await getAuthenticatedClient();
    const drive = google.drive({ version: 'v3', auth });
    const response = await drive.about.get({
      fields: 'user(emailAddress)'
    });
    return response.data.user?.emailAddress || null;
  } catch (err) {
    console.error('Error fetching user email:', err.message);
    return null;
  }
}

// Reconstruct and synchronize the database with files residing on Google Drive
async function fetchAndSyncAllFilesFromDrive() {
  try {
    const isAuth = await isAuthorized();
    if (!isAuth) {
      console.log('Auto-recovery sweep skipped: Google Drive is not connected.');
      return [];
    }

    const auth = await getAuthenticatedClient();
    const drive = google.drive({ version: 'v3', auth });

    // 1. Find the root folder named "MD Shakil Ahmad - Document Hub"
    console.log('Querying Google Drive for folder structures...');
    const rootFolderResponse = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and name='MD Shakil Ahmad - Document Hub' and trashed=false",
      fields: 'files(id)',
      spaces: 'drive'
    });

    const rootFolderId = rootFolderResponse.data.files[0]?.id;
    if (!rootFolderId) {
      console.log('No root folder structure found on Google Drive.');
      return [];
    }

    // 2. Find all child folders (Salary Slips, Overtime, Mileage)
    const foldersResponse = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    });

    const folders = foldersResponse.data.files || [];
    const folderMap = {};
    folders.forEach(f => {
      folderMap[f.name] = f.id;
    });

    const categories = [
      { name: 'Salary Slips', type: 'salary_slip' },
      { name: 'Overtime', type: 'ot' },
      { name: 'Mileage', type: 'mileage' },
      { name: 'ITR Projections', type: 'itr' }
    ];

    const recoveredFiles = [];

    // 3. For each category folder, scan files and check database synchronization
    for (const cat of categories) {
      const folderId = folderMap[cat.name];
      if (!folderId) continue;

      const filesResponse = await drive.files.list({
        q: `'${folderId}' in parents and mimeType='application/pdf' and trashed=false`,
        fields: 'files(id, name, createdTime)',
        spaces: 'drive'
      });

      const driveFiles = filesResponse.data.files || [];
      for (const file of driveFiles) {
        // Query if file is registered in database
        const existing = await dbGet('SELECT id FROM documents WHERE google_drive_id = ?', [file.id]);
        if (!existing) {
          console.log(`Auto-healing detected missing database record for Google Drive file: "${file.name}"`);
          const metadata = parseMetadataFromFilename(file.name, cat.type, file.createdTime);
          
          // Reconstruct the index item into documents table
          const insertSql = `
            INSERT INTO documents (category, date, file_name, file_path, amount, hours, miles, google_drive_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;
          
          await dbRun(insertSql, [
            cat.type,
            metadata.date,
            file.name,
            `uploads/${file.name}`, // Reconstruct default local path
            metadata.amount,
            metadata.hours,
            metadata.miles,
            file.id
          ]);
          recoveredFiles.push(file.name);
          console.log(`✓ Restored and synced database entry for: "${file.name}"`);
        }
      }
    }
    
    if (recoveredFiles.length > 0) {
      console.log(`Auto-recovery finished! Re-synced and restored ${recoveredFiles.length} files from Google Drive.`);
    } else {
      console.log('Google Drive folder structure is in sync with database. Zero entries restored.');
    }
    return recoveredFiles;

  } catch (err) {
    console.error('Failed to sync files from Google Drive:', err.message);
    return [];
  }
}

// Parse metadata values out of structured file names
function parseMetadataFromFilename(fileName, category, createdTime) {
  let date = createdTime ? createdTime.split('T')[0] : new Date().toISOString().split('T')[0];
  let amount = 0;
  let hours = 0;
  let miles = 0;

  try {
    const cleanName = fileName.replace(/\.pdf$/i, '');
    
    // Parse monthly items (Salary Slip, Mileage)
    if (category === 'salary_slip' || category === 'mileage') {
      const parts = cleanName.split('_');
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June', 
        'July', 'August', 'September', 'October', 'November', 'December'
      ];
      const monthIndex = monthNames.indexOf(parts[0]);
      const year = parseInt(parts[1]);
      if (monthIndex !== -1 && !isNaN(year)) {
        // Formulate standard date YYYY-MM-DD
        date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-01`;
      }

      if (category === 'salary_slip') {
        const amtPart = parts[parts.length - 1];
        if (!isNaN(parseFloat(amtPart))) amount = parseFloat(amtPart);
      } else {
        const milesPart = parts[parts.length - 1]?.replace('miles', '');
        if (!isNaN(parseFloat(milesPart))) miles = parseFloat(milesPart);
      }
    }
    // Parse biweekly items (OT)
    else if (category === 'ot') {
      // e.g. "06_Jun_to_19_Jun_2026_OT_15hrs"
      const parts = cleanName.split('_');
      const toIndex = parts.indexOf('to');
      if (toIndex !== -1) {
        const yearIndex = toIndex + 3; // "to" -> "19" -> "Jun" -> "2026"
        const year = parseInt(parts[yearIndex]);
        const monthStr = parts[yearIndex - 1];
        const day = parseInt(parts[yearIndex - 2]);
        
        const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthIndex = monthsShort.indexOf(monthStr);
        
        if (!isNaN(day) && monthIndex !== -1 && !isNaN(year)) {
          date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }

      const hrsPart = parts[parts.length - 1]?.replace('hrs', '');
      if (!isNaN(parseFloat(hrsPart))) hours = parseFloat(hrsPart);
    }
    else if (category === 'itr') {
      // e.g. "25-2026_ITR_Projection"
      const parts = cleanName.split('_');
      const fyStr = parts[0]; // "25-2026"
      const fyParts = fyStr.split('-');
      if (fyParts.length === 2) {
        const endingYear = parseInt(fyParts[1]);
        if (!isNaN(endingYear)) {
          const startingYear = endingYear - 1;
          date = `${startingYear}-04-01`;
        }
      }
    }
  } catch (err) {
    console.error('Metadata filename extraction failed, using createdTime fallback:', err.message);
  }

  return { date, amount, hours, miles };
}

// Download file stream from Google Drive
async function downloadFileStreamFromDrive(fileId) {
  const auth = await getAuthenticatedClient();
  const drive = google.drive({ version: 'v3', auth });
  
  const response = await drive.files.get(
    { fileId: fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  return response.data;
}

// Delete file from Google Drive
async function deleteFromDrive(fileId) {
  const auth = await getAuthenticatedClient();
  const drive = google.drive({ version: 'v3', auth });
  
  await drive.files.delete({
    fileId: fileId
  });
  console.log(`Successfully deleted file from Google Drive with ID ${fileId}`);
}

module.exports = {
  isAuthorized,
  getAuthUrl,
  saveTokensFromCode,
  uploadToDrive,
  getConnectedUserEmail,
  fetchAndSyncAllFilesFromDrive,
  downloadFileStreamFromDrive,
  deleteFromDrive
};
