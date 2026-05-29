const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { dbGet, dbRun } = require('./database');

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
    "INSERT OR REPLACE INTO settings (key, value) VALUES ('google_tokens', ?)",
    [JSON.stringify(tokens)]
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
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('google_tokens', ?)",
      [JSON.stringify(updatedTokens)]
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

module.exports = {
  isAuthorized,
  getAuthUrl,
  saveTokensFromCode,
  uploadToDrive
};
