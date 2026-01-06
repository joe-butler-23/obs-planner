import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { TFile } from "obsidian";
import { HealthService } from "./HealthService";
import type { LedgerEntry } from "./LedgerStore";

const makeFile = (path: string) => {
  const name = path.split("/").pop() ?? path;
  const extension = name.includes(".") ? name.split(".").pop() ?? "" : "";
  return new TFile(path, name, extension);
};

const makeApp = (paths: string[]) =>
  ({
    vault: {
      getFiles: () => paths.map(makeFile)
    }
  }) as unknown as App;

describe("HealthService", () => {
  it("counts inbox pending, archive, and error files", () => {
    const app = makeApp([
      "cooking/inbox/job-1.md",
      "cooking/inbox/archive/job-1.md",
      "cooking/inbox/archive/job-2.error.md",
      "cooking/inbox/archive/job-2.error.log.md",
      "cooking/recipes/recipe.md"
    ]);

    const ledger: LedgerEntry[] = [
      { key: "a", status: "success", processedAt: "2026-01-01T00:00:00Z" }
    ];

    const service = new HealthService(
      app,
      () => ({
        geminiApiKey: "",
        recipesFolder: "cooking/recipes",
        inboxFolder: "cooking/inbox",
        archiveFolder: "cooking/inbox/archive",
        imagesFolder: "cooking/recipes/images"
      }),
      () => ledger
    );

    const snapshot = service.getSnapshot();
    expect(snapshot.inboxPending).toBe(1);
    expect(snapshot.archiveTotal).toBe(3);
    expect(snapshot.errorTotal).toBe(1);
  });

  it("summarizes ledger entries and respects max entries", () => {
    const app = makeApp([]);
    const ledger: LedgerEntry[] = [
      { key: "a", status: "success", processedAt: "2026-01-01T00:00:00Z" },
      { key: "b", status: "error", processedAt: "2026-01-02T00:00:00Z" },
      { key: "c", status: "skipped", processedAt: "2026-01-03T00:00:00Z" }
    ];

    const service = new HealthService(
      app,
      () => ({
        geminiApiKey: "",
        recipesFolder: "recipes",
        inboxFolder: "inbox",
        archiveFolder: "inbox/archive",
        imagesFolder: "recipes/images"
      }),
      () => ledger
    );

    const snapshot = service.getSnapshot({ maxEntries: 2 });
    expect(snapshot.lastProcessedAt).toBe("2026-01-03T00:00:00Z");
    expect(snapshot.recentEntries).toHaveLength(2);
    expect(snapshot.recentEntries[0].key).toBe("c");
    expect(snapshot.ledgerCounts).toEqual({ success: 1, error: 1, skipped: 1 });
  });
});
