export class TFile {
  path: string;
  name: string;
  extension: string;
  stat: { mtime: number; size: number };

  constructor(path: string, name: string, extension: string, stat?: { mtime: number; size: number }) {
    this.path = path;
    this.name = name;
    this.extension = extension;
    this.stat = stat ?? { mtime: Date.now(), size: 0 };
  }

  get basename() {
    return this.name.replace(/\.[^/.]+$/, "");
  }
}

export const normalizePath = (path: string) =>
  path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");

export class Notice {
  constructor(_message: string) {}
}

export class Plugin {}

export class App {}

export class TAbstractFile {}
