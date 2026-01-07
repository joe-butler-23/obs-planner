import { App, normalizePath, TFile } from "obsidian";
import { createHash } from "crypto";
import { z } from "zod";
import { CookingAssistantSettings } from "../settings";
import { GeminiService } from "../modules/cooking/services/GeminiService";
import { LedgerStore } from "./LedgerStore";
import { DuplicateRecipeError, RecipeWriter } from "../modules/cooking/services/RecipeWriter";

const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const SUPPORTED_TEXT_EXTENSIONS = new Set(["txt", "md"]);

export const inboxJobSchema = z.object({
  type: z.enum(["url", "text", "image"]),
  content: z.string().min(1),
  created_at: z.string().optional(),
  id: z.string().optional(),
  source: z.string().optional()
});

export type InboxJob = z.infer<typeof inboxJobSchema>;

type ImagePayload = {
  bytes: ArrayBuffer;
  mimeType: string;
  sourceFile: TFile;
};

type JobBuildResult = {
  job: InboxJob;
  jobKey: string;
  imagePayload?: ImagePayload;
  secondaryFile?: TFile;
};

export class InboxWatcher {
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly app: App,
    private readonly getSettings: () => CookingAssistantSettings,
    private readonly gemini: GeminiService,
    private readonly recipeWriter: RecipeWriter,
    private readonly ledger: LedgerStore,
    private readonly notify: (message: string) => void
  ) {}

  async handleFileEvent(file: TFile) {
    if (this.shouldSkipFile(file)) return;
    await this.processFile(file);
  }

  async scanInbox() {
    const folder = normalizePath(this.getSettings().inboxFolder);
    const files = this.app.vault.getFiles().filter((f) => f.path.startsWith(`${folder}/`));
    for (const file of files) {
      if (this.shouldSkipFile(file)) continue;
      await this.processFile(file);
    }
  }

  private shouldSkipFile(file: TFile) {
    if (!this.isInInbox(file)) return true;
    if (this.isInArchive(file)) return true;
    if (file.name.endsWith(".error") || file.name.endsWith(".error.log.md")) return true;
    return false;
  }

  private isInInbox(file: TFile) {
    const folder = normalizePath(this.getSettings().inboxFolder);
    return file.path.startsWith(`${folder}/`);
  }

  private isInArchive(file: TFile) {
    const archiveFolder = normalizePath(this.getSettings().archiveFolder);
    return file.path.startsWith(`${archiveFolder}/`);
  }

  private async processFile(file: TFile) {
    if (this.inFlight.has(file.path)) return;
    this.inFlight.add(file.path);

    let job: InboxJob | null = null;
    let jobKey = this.hashString(`${file.path}:${file.stat.mtime}`);
    let secondaryFile: TFile | undefined;

    try {
      const build = await this.buildJob(file);
      job = build.job;
      jobKey = build.jobKey;
      secondaryFile = build.secondaryFile;

      if (this.ledger.hasSuccess(jobKey)) {
        await this.archive(file, ".dupe");
        this.ledger.recordSkipped(jobKey, "duplicate job");
        this.notify(`Skipped duplicate: ${file.name}`);
        return;
      }

      const result = await this.gemini.process(job, build.imagePayload);
      const recipePath = await this.recipeWriter.create(result, job);

      this.ledger.recordSuccess(jobKey, recipePath);
      await this.archive(file);

      if (secondaryFile && secondaryFile.path !== file.path && this.isInInbox(secondaryFile)) {
        await this.archive(secondaryFile);
      }

      this.notify(`Imported: ${recipePath}`);
    } catch (error) {
      if (error instanceof DuplicateRecipeError) {
        this.ledger.recordSkipped(jobKey, `duplicate recipe slug: ${error.slug}`);
        await this.archive(file, ".dupe");

        if (secondaryFile && secondaryFile.path !== file.path && this.isInInbox(secondaryFile)) {
          await this.archive(secondaryFile, ".dupe");
        }

        this.notify(`Skipped duplicate: ${file.name}`);
        return;
      }

      console.error(`Failed to process ${file.path}`, error);
      const reason = error instanceof Error ? error.message : "Unknown error";
      this.ledger.recordError(jobKey, reason);
      await this.quarantine(file, reason, job ?? undefined);
    } finally {
      this.inFlight.delete(file.path);
    }
  }

  private async buildJob(file: TFile): Promise<JobBuildResult> {
    const extension = file.extension.toLowerCase();

    if (extension === "json") {
      const raw = await this.app.vault.read(file);
      const parsed = this.parseJob(raw);
      const jobKey = parsed.id ?? this.hashString(JSON.stringify(parsed));

      if (parsed.type === "image") {
        const imagePayload = await this.loadImagePayloadFromPath(parsed.content);
        return {
          job: parsed,
          jobKey,
          imagePayload,
          secondaryFile: imagePayload.sourceFile
        };
      }

      return { job: parsed, jobKey };
    }

    if (this.isImageExtension(extension)) {
      const imagePayload = await this.loadImagePayloadFromFile(file);
      const job: InboxJob = {
        type: "image",
        content: file.path,
        created_at: new Date(file.stat.mtime).toISOString(),
        id: this.hashString(`${file.path}:${file.stat.mtime}:${file.stat.size}`)
      };

      return {
        job,
        jobKey: job.id ?? this.hashString(file.path),
        imagePayload,
        secondaryFile: file
      };
    }

    if (this.isTextExtension(extension)) {
      const raw = await this.app.vault.read(file);
      const trimmed = raw.trim();
      if (!trimmed) {
        throw new Error("Inbox text file is empty");
      }
      const isUrl = this.looksLikeUrl(trimmed);
      const job: InboxJob = {
        type: isUrl ? "url" : "text",
        content: trimmed,
        created_at: new Date(file.stat.mtime).toISOString(),
        id: this.hashString(trimmed)
      };
      return { job, jobKey: job.id ?? this.hashString(trimmed) };
    }

    throw new Error(`Unsupported inbox file type: ${extension}`);
  }

  private parseJob(raw: string): InboxJob {
    try {
      const parsed = JSON.parse(raw);
      return inboxJobSchema.parse(parsed);
    } catch (error) {
      throw new Error(`Invalid inbox job: ${error instanceof Error ? error.message : "unknown parse error"}`);
    }
  }

  private looksLikeUrl(value: string) {
    return /^(https?:\/\/[^\s]+)$/i.test(value.trim());
  }

  private isImageExtension(extension: string) {
    return SUPPORTED_IMAGE_EXTENSIONS.has(extension);
  }

  private isTextExtension(extension: string) {
    return SUPPORTED_TEXT_EXTENSIONS.has(extension);
  }

  private async loadImagePayloadFromPath(path: string): Promise<ImagePayload> {
    const normalized = normalizePath(path);
    const file = this.app.vault.getAbstractFileByPath(normalized);
    if (!(file instanceof TFile)) {
      throw new Error(`Image file not found: ${normalized}`);
    }
    if (!this.isImageExtension(file.extension)) {
      throw new Error(`Unsupported image type: ${file.extension}`);
    }
    return this.loadImagePayloadFromFile(file);
  }

  private async loadImagePayloadFromFile(file: TFile): Promise<ImagePayload> {
    const bytes = await this.app.vault.readBinary(file);
    const mimeType = this.inferMimeType(file.extension);
    return { bytes, mimeType, sourceFile: file };
  }

  private inferMimeType(extension: string) {
    switch (extension.toLowerCase()) {
      case "png":
        return "image/png";
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "webp":
        return "image/webp";
      default:
        return "application/octet-stream";
    }
  }

  private async archive(file: TFile, suffix?: string) {
    const settings = this.getSettings();
    const archiveFolder = normalizePath(settings.archiveFolder);
    await this.ensureFolder(archiveFolder);

    const target = this.uniqueArchivePath(`${archiveFolder}/${this.makeTargetName(file, suffix)}`);
    await this.app.fileManager.renameFile(file, normalizePath(target));
  }

  private makeTargetName(file: TFile, suffix?: string) {
    if (!suffix) return file.name;
    const ext = file.extension ? `.${file.extension}` : "";
    return `${file.basename}${suffix}${ext}`;
  }

  private uniqueArchivePath(path: string) {
    if (!this.app.vault.getAbstractFileByPath(path)) return path;

    const extension = path.includes(".") ? path.split(".").pop() ?? "" : "";
    const base = extension ? path.slice(0, -(extension.length + 1)) : path;

    let counter = 1;
    while (true) {
      const candidate = extension ? `${base}-${counter}.${extension}` : `${base}-${counter}`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) {
        return candidate;
      }
      counter += 1;
    }
  }

  private async quarantine(file: TFile, reason: string, job?: InboxJob) {
    const settings = this.getSettings();
    const archiveFolder = normalizePath(settings.archiveFolder);
    await this.ensureFolder(archiveFolder);

    const targetName = this.makeTargetName(file, ".error");
    const targetPath = this.uniqueArchivePath(`${archiveFolder}/${targetName}`);
    await this.app.fileManager.renameFile(file, normalizePath(targetPath));

    try {
      const note = [
        "# Quarantined job",
        `reason: ${reason}`,
        job ? `job: ${JSON.stringify(job, null, 2)}` : ""
      ]
        .filter(Boolean)
        .join("\n");
      const logPath = this.uniqueArchivePath(`${archiveFolder}/${file.basename}.error.log.md`);
      await this.app.vault.create(logPath, note);
    } catch (err) {
      console.error("Failed to write quarantine log", err);
    }
  }

  private async ensureFolder(path: string) {
    const normalized = normalizePath(path);
    const parts = normalized.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (this.app.vault.getAbstractFileByPath(current)) continue;
      await this.app.vault.createFolder(current);
    }
  }

  private hashString(value: string) {
    return createHash("sha1").update(value).digest("hex");
  }
}
