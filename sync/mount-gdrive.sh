#!/usr/bin/env bash

# Mount Google Drive recipe folder
MOUNT_POINT="/home/joebutler/mnt/gdrive-recipes"
REMOTE_PATH="gdrive:recipe-store/sorted"

# Check if already mounted
if mountpoint -q "$MOUNT_POINT"; then
    echo "Google Drive is already mounted at $MOUNT_POINT"
    exit 0
fi

# Ensure mount point exists
mkdir -p "$MOUNT_POINT"

# Mount with rclone
echo "Mounting Google Drive at $MOUNT_POINT..."
rclone mount "$REMOTE_PATH" "$MOUNT_POINT" \
    --vfs-cache-mode writes \
    --vfs-cache-max-age 10s \
    --dir-cache-time 10s \
    --poll-interval 15s \
    --allow-other \
    --daemon

# Wait a moment for mount to complete
sleep 2

# Verify mount
if mountpoint -q "$MOUNT_POINT"; then
    echo "Successfully mounted Google Drive"
    exit 0
else
    echo "Failed to mount Google Drive"
    exit 1
fi
