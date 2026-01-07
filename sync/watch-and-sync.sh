#!/usr/bin/env bash

# Watch Google Drive mount for changes and sync to local recipes folder
# This script uses inotifywait to detect file changes in real-time

MOUNT_POINT="/home/joebutler/mnt/gdrive-recipes"
WATCH_RECIPES="$MOUNT_POINT"
WATCH_IMAGES="$MOUNT_POINT/images"
LOCAL_RECIPES="/home/joebutler/projects/cooking/recipes"
LOCAL_IMAGES="/home/joebutler/projects/cooking/recipes/images"
LOG_FILE="/tmp/recipe-sync.log"

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to sync files with filters
sync_files() {
    local source="$1"
    local dest="$2"
    local label="$3"
    local include_pattern="$4"
    
    log "Syncing $label from $source to $dest"
    
    # Ensure destination exists
    mkdir -p "$dest"
    
    # Use rsync to copy files from Google Drive to local
    # IMPORTANT: NO --delete flag! We ONLY add/update files, NEVER delete local files
    # Local recipes folder may contain files not in Google Drive - that's OK
    if [ -n "$include_pattern" ]; then
        rsync -av --include="$include_pattern" --exclude='*' "$source/" "$dest/" >> "$LOG_FILE" 2>&1
    else
        rsync -av "$source/" "$dest/" >> "$LOG_FILE" 2>&1
    fi
    
    if [ $? -eq 0 ]; then
        log "$label sync completed successfully"
    else
        log "ERROR: $label sync failed"
    fi
}

# Check if mount point is mounted
if ! mountpoint -q "$MOUNT_POINT"; then
    log "ERROR: Google Drive is not mounted at $MOUNT_POINT"
    log "Please run mount-gdrive.sh first"
    exit 1
fi

log "Starting recipe watch and sync service..."
log "Watching: $WATCH_RECIPES (*.md files) and $WATCH_IMAGES (*.webp files)"
log "Syncing to: $LOCAL_RECIPES"

# Initial sync on startup
log "Performing initial sync..."
sync_files "$WATCH_RECIPES" "$LOCAL_RECIPES" "recipes (*.md files)" "*.md"
sync_files "$WATCH_IMAGES" "$LOCAL_IMAGES" "images (*.webp files)" "*.webp"

# Watch for changes using inotifywait
# Exclude processed/ folder from watching
log "Now watching for changes..."
inotifywait -m -r -e modify,create,delete,move \
    --exclude '/processed(/|$)' \
    "$WATCH_RECIPES" "$WATCH_IMAGES" 2>&1 | \
while read -r directory events filename; do
    log "Detected change: $events on $filename in $directory"
    
    # Only sync if it's the right file type
    if [[ "$directory" == *"/images"* ]] && [[ "$filename" == *.webp ]]; then
        # Image file changed
        sleep 1
        sync_files "$WATCH_IMAGES" "$LOCAL_IMAGES" "images (*.webp files)" "*.webp"
    elif [[ "$directory" != *"/images"* ]] && [[ "$directory" != *"/processed"* ]] && [[ "$filename" == *.md ]]; then
        # Recipe file changed in root
        sleep 1
        sync_files "$WATCH_RECIPES" "$LOCAL_RECIPES" "recipes (*.md files)" "*.md"
    else
        log "Ignoring change (not *.md or *.webp file, or in processed/ folder)"
    fi
done
