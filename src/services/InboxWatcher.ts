import { App, normalizePath, TFile } from "obsidian";
import { z } from "zod";
import { CookingAssistantSettings } from "../settings";
import { GeminiService } from "./GeminiService";
import { RecipeWriter } from "./RecipeWriter";

export const inboxJobSchema = z.object({
  type: z.enum(["url", "text", "image"]),
  content: z.string().min(1),
  created_at: z.string().optional(),
  id: z.string().optional(),
  source: z.string().optional()
});

export type InboxJob = z.infer<typeof inboxJobSchema>;

export class InboxWatcher {
  private readonly processedIds = new Set<string>();

  constructor(
    private readonly app: App,
    private readonly getSettings: () => CookingAssistantSettings,
    private readonly gemini: GeminiService,
    private readonly recipeWriter: RecipeWriter,
    private readonly notify: (message: string) => void
  ) {}

  async handleFileEvent(file: TFile) {
    if (!this.isInInbox(file)) return;
    await this.processFile(file);
  }

  async scanInbox() {
    const settings = this.getSettings();
    const folder = normalizePath(settings.inboxFolder);
    const files = this.app.vault.getFiles().filter((f) => f.path.startsWith(`${folder}/`));
    for (const file of files) {
      await this.processFile(file);
    }
  }

  private isInInbox(file: TFile) {
    const folder = normalizePath(this.getSettings().inboxFolder);
    return file.path.startsWith(`${folder}/`);
  }

  private async processFile(file: TFile) {
    let job: InboxJob | null = null;
    try {
      const raw = await this.app.vault.read(file);
      job = this.parseJob(raw);
      const jobId = job.id ?? file.basename;
      if (this.processedIds.has(jobId)) return;

      const result = await this.gemini.process(job);
      const recipePath = await this.recipeWriter.create(result, job);

      this.processedIds.add(jobId);
      await this.archive(file);
      this.notify(`Imported: ${recipePath}`);
    } catch (error) {
      console.error(`Failed to process ${file.path}`, error);
      const reason = error instanceof Error ? error.message : "Unknown error";
      await this.quarantine(file, reason, job ?? undefined);
    }
  }

  private parseJob(raw: string): InboxJob {
    try {
      const parsed = JSON.parse(raw);
      return inboxJobSchema.parse(parsed);
    } catch (error) {
      throw new Error(`Invalid inbox job: ${error instanceof Error ? error.message : "unknown parse error"}`);
    }
  }

  private async archive(file: TFile) {
    const settings = this.getSettings();
    const archiveFolder = normalizePath(settings.archiveFolder);
    await this.ensureFolder(archiveFolder);
    const target = `${archiveFolder}/${file.name}`;
    await this.app.fileManager.renameFile(file, normalizePath(target));
  }

  private async quarantine(file: TFile, reason: string, job?: InboxJob) {
    const settings = this.getSettings();
    const archiveFolder = normalizePath(settings.archiveFolder);
    await this.ensureFolder(archiveFolder);
    const targetName = `${file.name}.error`;
    const targetPath = `${archiveFolder}/${targetName}`;
    await this.app.fileManager.renameFile(file, normalizePath(targetPath));

    try {
      const note = [
        `# Quarantined job`,
        `reason: ${reason}`,
        job ? `job: ${JSON.stringify(job, null, 2)}` : ""
      ].join("\n");
      const logPath = `${archiveFolder}/${file.basename}.error.log.md`;
      await this.app.vault.create(logPath, note);
    } catch (err) {
      console.error("Failed to write quarantine log", err);
    }
  }

  private async ensureFolder(path: string) {
    const normalized = normalizePath(path);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing) return;
    await this.app.vault.createFolder(normalized);
  }
}
