# Google Drive Sync Daemon Setup

This daemon uses the Google Drive Changes API to monitor your destination folder for new files and automatically sync them to your local Obsidian vault.

## Why This Is Better

- ✅ **Detects remote changes** - Works when files are added via the web app
- ✅ **Real-time monitoring** - Uses Drive Changes API (same as your React app)
- ✅ **Reliable** - No dependency on inotify/filesystem events
- ✅ **Efficient** - Only syncs when changes are detected

## Setup Steps

### 1. Create OAuth2 Credentials

You need **Desktop Application** credentials (different from your Web Application credentials):

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Click **"+ CREATE CREDENTIALS"** → **"OAuth client ID"**
3. Choose **"Desktop app"** as application type
4. Name it: `Recipe Sync Daemon`
5. Click **"CREATE"**
6. Click **"DOWNLOAD JSON"** button
7. Save the downloaded file as `credentials.json` in this directory:
   ```
   /home/joebutler/development/obs-sync/credentials.json
   ```

### 2. Enable Drive API

Make sure the Google Drive API is enabled:
1. Go to [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com)
2. Click **"ENABLE"**

### 3. Run the Daemon

First time setup (will ask you to authenticate):
```bash
cd /home/joebutler/development/obs-sync
node sync-daemon.js
```

The daemon will:
1. Open a browser for you to authorize the app
2. Give you a code to paste back
3. Save the token to `token.json` for future use
4. Start monitoring for changes

### 4. Stop the Old Watch Script

Since we're using the new daemon, stop the old inotifywait-based script:
```bash
# Find and kill the old watch-and-sync processes
pkill -f watch-and-sync.sh
pkill -f inotifywait
```

### 5. Run Daemon in Background

To run the daemon as a background service:
```bash
# Using nohup (simple)
nohup node /home/joebutler/development/obs-sync/sync-daemon.js > /tmp/sync-daemon-output.log 2>&1 &

# Or create a systemd service (recommended)
# See SYSTEMD-SERVICE.md for instructions
```

## Monitoring

View the sync log:
```bash
tail -f /tmp/sync-daemon.log
```

Check if the daemon is running:
```bash
ps aux | grep sync-daemon.js
```

## How It Works

1. **Initial Sync**: On startup, syncs all existing files
2. **Change Monitoring**: Polls Drive Changes API every 10 seconds
3. **Automatic Sync**: When changes detected, runs rsync to sync files
4. **Token Refresh**: Automatically refreshes OAuth tokens when expired

## Configuration

Edit `sync-daemon.js` to customize:
- `POLL_INTERVAL`: How often to check for changes (default: 10000ms)
- `DESTINATION_FOLDER_ID`: Which folder to monitor
- `MOUNT_POINT`: Where rclone mounts Google Drive
- `LOCAL_RECIPES`: Where to sync files locally

## Troubleshooting

**"credentials.json not found"**
- Download Desktop Application credentials from Google Cloud Console
- Save as `credentials.json` in the project directory

**"Token expired"**
- The daemon auto-refreshes tokens
- If it fails, delete `token.json` and re-authenticate

**"No changes detected"**
- Check the folder ID matches your destination folder
- View logs: `tail -f /tmp/sync-daemon.log`
- Ensure Drive API is enabled

**"rsync errors"**
- Make sure rclone mount is running: `mount | grep rclone`
- Check mount point path is correct
- Verify local destination directories exist
