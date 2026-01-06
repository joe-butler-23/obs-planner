export type LedgerStatus = "success" | "error" | "skipped";

export interface LedgerEntry {
  key: string;
  status: LedgerStatus;
  processedAt: string;
  detail?: string;
}

export class LedgerStore {
  private entries: Map<string, LedgerEntry>;

  constructor(
    initialEntries: LedgerEntry[],
    private readonly persist: (entries: LedgerEntry[]) => Promise<void>,
    private readonly limit: number = 500
  ) {
    this.entries = new Map(initialEntries.map((entry) => [entry.key, entry]));
    this.prune();
  }

  hasSuccess(key: string) {
    return this.entries.get(key)?.status === "success";
  }

  recordSuccess(key: string, detail?: string) {
    this.entries.set(key, {
      key,
      status: "success",
      processedAt: new Date().toISOString(),
      detail
    });
    this.flush();
  }

  recordError(key: string, detail?: string) {
    this.entries.set(key, {
      key,
      status: "error",
      processedAt: new Date().toISOString(),
      detail
    });
    this.flush();
  }

  recordSkipped(key: string, detail?: string) {
    this.entries.set(key, {
      key,
      status: "skipped",
      processedAt: new Date().toISOString(),
      detail
    });
    this.flush();
  }

  serialize(): LedgerEntry[] {
    return Array.from(this.entries.values()).sort((a, b) =>
      a.processedAt.localeCompare(b.processedAt)
    );
  }

  private flush() {
    this.prune();
    void this.persist(this.serialize());
  }

  private prune() {
    if (this.entries.size <= this.limit) return;
    const sorted = this.serialize();
    const overflow = sorted.length - this.limit;
    for (let i = 0; i < overflow; i += 1) {
      this.entries.delete(sorted[i].key);
    }
  }
}
