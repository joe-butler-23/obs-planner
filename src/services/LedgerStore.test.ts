import { describe, expect, it, vi } from "vitest";
import { LedgerStore } from "./LedgerStore";

describe("LedgerStore", () => {
  it("records success and prunes oldest entries", () => {
    const persisted: string[] = [];
    const store = new LedgerStore([], async (entries) => {
      persisted.push(JSON.stringify(entries));
    }, 2);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    store.recordSuccess("job-a");
    vi.setSystemTime(new Date("2026-01-01T00:00:01Z"));
    store.recordSuccess("job-b");
    vi.setSystemTime(new Date("2026-01-01T00:00:02Z"));
    store.recordSuccess("job-c");
    vi.useRealTimers();

    expect(store.hasSuccess("job-a")).toBe(false);
    expect(store.hasSuccess("job-b")).toBe(true);
    expect(store.hasSuccess("job-c")).toBe(true);
    expect(store.serialize().length).toBe(2);
    expect(persisted.length).toBeGreaterThan(0);
  });
});
