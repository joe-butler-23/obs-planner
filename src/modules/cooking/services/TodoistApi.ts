import { App, Plugin } from "obsidian";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const SHOPPING_PROJECT_ID = "2353762598";
export const BRIDGE_CLUB_PROJECT_MATCH = "bridge club";

export type TodoistTaskPayload = {
  content: string;
  labels?: string[];
  due_date?: string;
  section_id?: string;
};

export class TodoistApi {
  constructor(private app: App, private plugin: Plugin) {}

  async listTasks(projectId: string = SHOPPING_PROJECT_ID): Promise<any[]> {
    const output = await this.runCommand(["list", "--project", projectId]);
    return JSON.parse(output);
  }

  async listProjects(): Promise<Array<{ id: string; name: string }>> {
    const output = await this.runCommand(["projects"]);
    return JSON.parse(output);
  }

  async createBatch(projectId: string, tasks: TodoistTaskPayload[]) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "todoist-"));
    const payloadPath = path.join(tmpDir, "tasks.json");
    await fs.writeFile(payloadPath, JSON.stringify(tasks, null, 2), "utf8");

    try {
      const output = await this.runCommand([
        "create-batch",
        "--project",
        projectId,
        "--file",
        payloadPath
      ]);
      return JSON.parse(output);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  }

  private async runCommand(args: string[]): Promise<string> {
    const scriptPath = this.getScriptPath();
    const { stdout } = await execFileAsync("python3", [scriptPath, ...args], {
      maxBuffer: 1024 * 1024 * 5
    });
    return stdout;
  }

  private getScriptPath(): string {
    const vaultPath = this.app.vault.adapter.getBasePath();
    const configDir = this.app.vault.configDir || ".obsidian";
    const pluginId = this.plugin.manifest.id;
    const normalized = path.normalize(vaultPath);
    const pluginsSuffix = path.join(configDir, "plugins");

    if (normalized.endsWith(pluginsSuffix)) {
      return path.join(normalized, pluginId, "scripts", "todoist_client.py");
    }
    if (normalized.endsWith(configDir)) {
      return path.join(normalized, "plugins", pluginId, "scripts", "todoist_client.py");
    }
    return path.join(normalized, configDir, "plugins", pluginId, "scripts", "todoist_client.py");
  }
}
