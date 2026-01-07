#!/usr/bin/env node

/**
 * Google Drive Sync Daemon
 * Uses Drive Changes API to monitor for new files and sync them locally
 */

const { google } = require('googleapis');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration
const CONFIG = {
  DESTINATION_FOLDER_ID: process.env.DESTINATION_FOLDER_ID || '1fFFTEAsN0biXl3O8O4R5DPmaIoq5OZ_1',
  MOUNT_POINT: '/home/joebutler/mnt/gdrive-recipes',
  LOCAL_RECIPES: '/home/joebutler/projects/cooking/recipes',
  LOCAL_IMAGES: '/home/joebutler/projects/cooking/recipes/images',
  POLL_INTERVAL: 10000, // 10 seconds
  CREDENTIALS_PATH: path.join(__dirname, 'credentials.json'),
  TOKEN_PATH: path.join(__dirname, 'token.json'),
  LOG_FILE: '/tmp/sync-daemon.log'
};

// Logger
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  fs.appendFileSync(CONFIG.LOG_FILE, logMessage);
}

// OAuth2 Client Setup
async function authorize() {
  // Check if credentials file exists
  if (!fs.existsSync(CONFIG.CREDENTIALS_PATH)) {
    log('ERROR: credentials.json not found. Please download OAuth2 credentials from Google Cloud Console.');
    log('Visit: https://console.cloud.google.com/apis/credentials');
    log(`Save the credentials to: ${CONFIG.CREDENTIALS_PATH}`);
    process.exit(1);
  }

  const credentials = JSON.parse(fs.readFileSync(CONFIG.CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Check if we have a saved token
  if (fs.existsSync(CONFIG.TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(CONFIG.TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    
    // Refresh token if expired
    if (token.expiry_date && token.expiry_date < Date.now()) {
      log('Token expired, refreshing...');
      try {
        const newTokens = await oAuth2Client.refreshAccessToken();
        oAuth2Client.setCredentials(newTokens.credentials);
        fs.writeFileSync(CONFIG.TOKEN_PATH, JSON.stringify(newTokens.credentials));
        log('Token refreshed successfully');
      } catch (err) {
        log('Error refreshing token: ' + err.message);
        fs.unlinkSync(CONFIG.TOKEN_PATH);
        return authorize(); // Re-authenticate
      }
    }
    
    return oAuth2Client;
  }

  // Need to get new token
  return getNewToken(oAuth2Client);
}

async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    rl.question('Enter the code from that page here: ', async (code) => {
      rl.close();
      try {
        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);
        fs.writeFileSync(CONFIG.TOKEN_PATH, JSON.stringify(tokens));
        log('Token stored to ' + CONFIG.TOKEN_PATH);
        resolve(oAuth2Client);
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Sync functions
function syncMarkdownFiles() {
  try {
    log('Syncing markdown files...');
    const cmd = `rsync -av --include="*.md" --exclude='*' "${CONFIG.MOUNT_POINT}/" "${CONFIG.LOCAL_RECIPES}/"`;
    const output = execSync(cmd, { encoding: 'utf-8' });
    const changedFiles = output.split('\n').filter(line => line.endsWith('.md'));
    if (changedFiles.length > 0) {
      log(`Synced ${changedFiles.length} markdown file(s)`);
    }
    return changedFiles.length;
  } catch (err) {
    log('Error syncing markdown: ' + err.message);
    return 0;
  }
}

function syncImageFiles() {
  try {
    log('Syncing image files...');
    const cmd = `rsync -av --include="*.webp" --exclude='*' "${CONFIG.MOUNT_POINT}/images/" "${CONFIG.LOCAL_IMAGES}/"`;
    const output = execSync(cmd, { encoding: 'utf-8' });
    const changedFiles = output.split('\n').filter(line => line.endsWith('.webp'));
    if (changedFiles.length > 0) {
      log(`Synced ${changedFiles.length} image file(s)`);
    }
    return changedFiles.length;
  } catch (err) {
    log('Error syncing images: ' + err.message);
    return 0;
  }
}

// Main monitoring loop
async function startMonitoring(auth) {
  const drive = google.drive({ version: 'v3', auth });
  
  log('Starting Drive monitoring daemon...');
  log(`Watching folder ID: ${CONFIG.DESTINATION_FOLDER_ID}`);
  log(`Mount point: ${CONFIG.MOUNT_POINT}`);
  log(`Local recipes: ${CONFIG.LOCAL_RECIPES}`);
  
  // Get initial start page token
  let pageToken;
  try {
    const response = await drive.changes.getStartPageToken({});
    pageToken = response.data.startPageToken;
    log(`Initial page token: ${pageToken}`);
  } catch (err) {
    log('Error getting start page token: ' + err.message);
    process.exit(1);
  }

  // Initial sync
  log('Performing initial sync...');
  syncMarkdownFiles();
  syncImageFiles();
  log('Initial sync complete. Now monitoring for changes...');

  // Poll for changes
  setInterval(async () => {
    try {
      const response = await drive.changes.list({
        pageToken: pageToken,
        fields: 'newStartPageToken, nextPageToken, changes(file(id, name, mimeType, parents, trashed))',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        pageSize: 100
      });

      const changes = response.data.changes || [];
      let hasRelevantChanges = false;

      for (const change of changes) {
        const file = change.file;
        
        // Check if file is in our destination folder
        if (file && !file.trashed && file.parents && file.parents.includes(CONFIG.DESTINATION_FOLDER_ID)) {
          log(`Detected change: ${file.name} (${file.mimeType})`);
          hasRelevantChanges = true;
        }
      }

      // Update token
      pageToken = response.data.newStartPageToken || response.data.nextPageToken;

      // If we detected changes, sync
      if (hasRelevantChanges) {
        log('Changes detected, triggering sync...');
        const mdCount = syncMarkdownFiles();
        const imgCount = syncImageFiles();
        log(`Sync complete: ${mdCount} markdown, ${imgCount} images`);
      }

    } catch (err) {
      log('Error checking for changes: ' + err.message);
      // Don't exit, keep trying
    }
  }, CONFIG.POLL_INTERVAL);

  log(`Monitoring active. Polling every ${CONFIG.POLL_INTERVAL / 1000} seconds.`);
}

// Main
(async () => {
  try {
    log('=== Google Drive Sync Daemon Starting ===');
    const auth = await authorize();
    await startMonitoring(auth);
  } catch (err) {
    log('Fatal error: ' + err.message);
    process.exit(1);
  }
})();

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});
