# Google Drive to Local Recipe Sync

Automatically watches your Google Drive recipes folder and syncs new files to your local recipes directory using inotify for real-time file watching.

## Prerequisites

You need `inotify-tools` installed. On NixOS, add to your configuration:

```nix
environment.systemPackages = with pkgs; [
  inotify-tools
  # ... your other packages
];
```

Then rebuild: `sudo nixos-rebuild switch`

## How It Works

1. **Mount**: Google Drive folder `gdrive:recipe-store/sorted` is mounted at `/home/joebutler/mnt/gdrive-recipes`
2. **Watch**: `inotifywait` monitors the mounted folders for file changes (create, modify, delete, move)
3. **Sync**: When changes are detected, `rsync` copies new/changed files to your local recipes folder
4. **One-way**: Syncs FROM Google Drive TO local only (never deletes local files)

## Directory Structure

- **Source (Google Drive mounted):**
  - `/home/joebutler/mnt/gdrive-recipes/` → Recipe .md files (root folder)
  - `/home/joebutler/mnt/gdrive-recipes/images/` → Recipe .webp images
  - `/home/joebutler/mnt/gdrive-recipes/processed/` → **IGNORED** (not synced)

- **Destination (Local):**
  - `/home/joebutler/projects/cooking/recipes/` → Recipe .md files
  - `/home/joebutler/projects/cooking/recipes/images/` → Recipe .webp images

**File filtering:**
- Only `*.md` files from the root Google Drive folder are synced
- Only `*.webp` images from the images folder are synced
- The `processed/` folder is completely ignored

**Important:** The sync only **adds/updates** files. It never deletes local files, so your local recipes folder can contain files that aren't in Google Drive.

## Manual Testing

1. **Mount Google Drive:**
   ```bash
   ./mount-gdrive.sh
   ```

2. **Verify mount:**
   ```bash
   ls /home/joebutler/mnt/gdrive-recipes/
   ```

3. **Run watch script (in foreground for testing):**
   ```bash
   ./watch-and-sync.sh
   ```

4. **Check logs:**
   ```bash
   tail -f /tmp/recipe-sync.log
   ```

5. **Test by adding a file to Google Drive** and watch it sync to local

6. **Unmount when done testing:**
   ```bash
   fusermount -u /home/joebutler/mnt/gdrive-recipes
   ```

## Install as Systemd Services (NixOS)

Since you're on NixOS, add the services to your system configuration.

### Option 1: Import the services module

Add to your `/etc/nixos/configuration.nix`:

```nix
{ config, pkgs, ... }:

{
  imports = [
    /home/joebutler/development/obs-sync/nixos-services.nix
  ];
  
  # ... rest of your config
}
```

### Option 2: Add services directly

Copy the content from `nixos-services.nix` directly into your configuration.

### Apply the configuration

```bash
sudo nixos-rebuild switch
```

### Control the services

After rebuilding, the services will start automatically. To manage them manually:

```bash
# Check status
systemctl --user status gdrive-recipes-mount.service
systemctl --user status recipe-watch-sync.service

# Stop services
systemctl --user stop recipe-watch-sync.service
systemctl --user stop gdrive-recipes-mount.service

# Start services
systemctl --user start gdrive-recipes-mount.service
systemctl --user start recipe-watch-sync.service

# Restart services
systemctl --user restart gdrive-recipes-mount.service
systemctl --user restart recipe-watch-sync.service

# View logs
journalctl --user -u gdrive-recipes-mount.service -f
journalctl --user -u recipe-watch-sync.service -f
```

## Monitoring

- **View logs:** `tail -f /tmp/recipe-sync.log`
- **Check mount status:** `mountpoint /home/joebutler/mnt/gdrive-recipes`
- **Service status:** `systemctl --user status recipe-watch-sync.service`

## Troubleshooting

### Mount fails
- Check rclone config: `rclone listremotes`
- Test remote access: `rclone ls gdrive:recipe-store/sorted`

### Watch script fails
- Ensure mount is active: `mountpoint -q /home/joebutler/mnt/gdrive-recipes`
- Check inotify-tools installed: `which inotifywait`

### Files not syncing
- Check logs: `tail -f /tmp/recipe-sync.log`
- Verify permissions on local directories
- Ensure files are correct type (*.md for recipes, *.webp for images)
- Test rsync manually:
  - Recipes: `rsync -av --include='*.md' --exclude='*' /home/joebutler/mnt/gdrive-recipes/ /home/joebutler/projects/cooking/recipes/`
  - Images: `rsync -av --include='*.webp' --exclude='*' /home/joebutler/mnt/gdrive-recipes/images/ /home/joebutler/projects/cooking/recipes/images/`

## Stopping Services

```bash
systemctl --user stop recipe-watch-sync.service
systemctl --user stop gdrive-recipes-mount.service
```

## Disabling Services

To prevent them from starting on boot, remove them from your NixOS configuration and rebuild:

```bash
sudo nixos-rebuild switch
```

## Files

- `mount-gdrive.sh` - Mounts Google Drive using rclone
- `watch-and-sync.sh` - Watches for changes and syncs files
- `nixos-services.nix` - NixOS systemd service configuration
