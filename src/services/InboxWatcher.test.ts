import { describe, expect, it } from "vitest";
import { inboxJobSchema } from "./InboxWatcher";

describe("inboxJobSchema", () => {
  it("accepts valid url jobs", () => {
    const job = {
      type: "url",
      content: "https://example.com/recipe",
      created_at: "2026-01-01T00:00:00Z",
      id: "job-123",
      source: "ios-shortcut"
    };

    expect(inboxJobSchema.parse(job)).toEqual(job);
  });

  it("rejects empty content", () => {
    expect(() =>
      inboxJobSchema.parse({
        type: "text",
        content: ""
      })
    ).toThrow();
  });
});
