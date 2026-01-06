import { App, normalizePath, TFile } from "obsidian";
import { CookingAssistantSettings } from "../settings";
import { LedgerEntry, LedgerStatus } from "./LedgerStore";

export type LedgerCounts = Record<LedgerStatus, number>;

export type HealthSnapshot = {
  inboxPending: number;
  archiveTotal: number;
  errorTotal: number;
  lastProcessedAt: string | null;
  recentEntries: LedgerEntry[];
  ledgerCounts: LedgerCounts;
};

const ERROR_LOG_SUFFIX = ".error.log.md";

const isErrorLogFile = (file: TFile) => file.name.toLowerCase().endsWith(ERROR_LOG_SUFFIX);

const isErrorJobFile = (file: TFile) => {
  const name = file.name.toLowerCase();
  if (name.endsWith(ERROR_LOG_SUFFIX)) return false;
  return name.endsWith(".error") || name.includes(".error.");
};

const isErrorArtifact = (file: TFile) => isErrorJobFile(file) || isErrorLogFile(file);

export class HealthService {
  constructor(
    private readonly app: App,
    private readonly getSettings: () => CookingAssistantSettings,
    private readonly getLedgerEntries: () => LedgerEntry[]
  ) {}

  getSnapshot({ maxEntries = 20 }: { maxEntries?: number } = {}): HealthSnapshot {
    const settings = this.getSettings();
    const inboxFolder = `${normalizePath(settings.inboxFolder)}/`;
    const archiveFolder = `${normalizePath(settings.archiveFolder)}/`;

    const files = this.app.vault.getFiles();
    const inboxFiles = files.filter((file) => file.path.startsWith(inboxFolder));
    const archiveFiles = files.filter((file) => file.path.startsWith(archiveFolder));

    const inboxPending = inboxFiles.filter(
      (file) => !file.path.startsWith(archiveFolder) && !isErrorArtifact(file)
    ).length;

    const errorTotal = archiveFiles.filter((file) => isErrorJobFile(file)).length;

    const ledgerEntries = [...this.getLedgerEntries()].sort((a, b) =>
      b.processedAt.localeCompare(a.processedAt)
    );
    const recentEntries = ledgerEntries.slice(0, maxEntries);
    const lastProcessedAt = recentEntries[0]?.processedAt ?? null;

    const ledgerCounts: LedgerCounts = {
      success: 0,
      error: 0,
      skipped: 0
    };
    for (const entry of ledgerEntries) {
      ledgerCounts[entry.status] += 1;
    }

    return {
      inboxPending,
      archiveTotal: archiveFiles.length,
      errorTotal,
      lastProcessedAt,
      recentEntries,
      ledgerCounts
    };
  }
}
