import { normalizePath } from "obsidian";
import { InboxJob } from "./InboxWatcher";

export interface GeminiResult {
  title: string;
  source?: string | null;
  markdownBody: string;
  coverImagePath?: string | null;
  added: string;
}

export class GeminiService {
  constructor(private readonly getApiKey: () => string) {}

  // Placeholder implementation; wire actual Gemini calls here.
  async process(job: InboxJob): Promise<GeminiResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error("Gemini API key is missing");
    }

    const today = new Date().toISOString().slice(0, 10);
    const title = this.deriveTitle(job);
    const source = job.type === "url" ? job.content : null;
    const coverImagePath = job.type === "image" ? job.content : null;

    const markdownBody = [
      "## Ingredients",
      "- TODO",
      "",
      "## Method",
      "1. TODO"
    ].join("\n");

    return {
      title,
      source,
      markdownBody,
      coverImagePath: coverImagePath ? normalizePath(coverImagePath) : null,
      added: today
    };
  }

  private deriveTitle(job: InboxJob): string {
    if (job.type === "url") {
      try {
        const url = new URL(job.content);
        return url.hostname.replace(/^www\./, "");
      } catch {
        return "Captured Recipe";
      }
    }
    return job.type === "text" ? job.content.slice(0, 40) || "Captured Recipe" : "Captured Recipe";
  }
}
