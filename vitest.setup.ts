import { vi } from "vitest";

class MockTFile {
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

const normalizePath = (path: string) =>
  path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");

vi.mock("obsidian", () => {
  return {
    normalizePath,
    TFile: MockTFile,
    Notice: class {},
    Plugin: class {},
    App: class {},
    TAbstractFile: class {}
  };
});
