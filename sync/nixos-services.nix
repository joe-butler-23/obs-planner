# NixOS systemd service configuration for Google Drive recipe sync
# Add this to your NixOS configuration

{ config, pkgs, ... }:

{
  systemd.user.services.gdrive-recipes-mount = {
    description = "Mount Google Drive recipes folder";
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    wantedBy = [ "default.target" ];
    
    serviceConfig = {
      Type = "forking";
      ExecStart = "${pkgs.bash}/bin/bash /home/joebutler/development/obs-sync/mount-gdrive.sh";
      ExecStop = "${pkgs.fuse}/bin/fusermount -u /home/joebutler/mnt/gdrive-recipes";
      Restart = "on-failure";
      RestartSec = 10;
    };
  };

  systemd.user.services.recipe-watch-sync = {
    description = "Watch Google Drive recipes and sync to local folder";
    after = [ "gdrive-recipes-mount.service" ];
    requires = [ "gdrive-recipes-mount.service" ];
    wantedBy = [ "default.target" ];
    
    serviceConfig = {
      Type = "simple";
      ExecStart = "${pkgs.bash}/bin/bash /home/joebutler/development/obs-sync/watch-and-sync.sh";
      Restart = "always";
      RestartSec = 10;
      StandardOutput = "append:/tmp/recipe-sync.log";
      StandardError = "append:/tmp/recipe-sync.log";
    };
  };
}
