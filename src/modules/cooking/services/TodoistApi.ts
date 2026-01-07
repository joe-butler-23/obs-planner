import { requestUrl } from "obsidian";

export const SHOPPING_PROJECT_ID = "2353762598";
export const BRIDGE_CLUB_PROJECT_MATCH = "bridge club";

export type TodoistTaskPayload = {
  content: string;
  labels?: string[];
  due_date?: string;
  section_id?: string;
};

export class TodoistApi {
  constructor(private readonly getToken: () => string) {}

  private async request(method: string, path: string, body?: any, params?: Record<string, string>) {
    const token = this.getToken();
    if (!token) {
      throw new Error("Todoist API token is missing");
    }

    let url = `https://api.todoist.com/rest/v2${path}`;
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    const response = await requestUrl({
      url,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined,
      throw: false
    });

    if (response.status >= 400) {
      throw new Error(`Todoist API error (${response.status}): ${response.text}`);
    }

    return response.json;
  }

  async listTasks(projectId: string = SHOPPING_PROJECT_ID): Promise<any[]> {
    return this.request("GET", "/tasks", undefined, { project_id: projectId });
  }

  async listProjects(): Promise<Array<{ id: string; name: string }>> {
    return this.request("GET", "/projects");
  }

  async createBatch(projectId: string, tasks: TodoistTaskPayload[]) {
    const created = [];
    for (const task of tasks) {
      const res = await this.request("POST", "/tasks", { ...task, project_id: projectId });
      created.push(res);
    }
    return created;
  }
}