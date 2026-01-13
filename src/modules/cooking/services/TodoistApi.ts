import { requestUrl } from "obsidian";

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
      console.error('[TodoistApi] API request failed', {
        method,
        path,
        status: response.status,
        response: response.text,
        timestamp: new Date().toISOString()
      });
      throw new Error(`Todoist API error (${response.status})`);
    }

    return response.json;
  }

  async listTasks(projectId: string): Promise<any[]> {
    return this.request("GET", "/tasks", undefined, { project_id: projectId });
  }

  async listProjects(): Promise<Array<{ id: string; name: string }>> {
    return this.request("GET", "/projects");
  }

  async createBatch(projectId: string, tasks: TodoistTaskPayload[]) {
    if (tasks.length === 0) return [];

    console.debug('[TodoistApi] Creating batch of tasks', {
      projectId,
      count: tasks.length,
      timestamp: new Date().toISOString()
    });

    // Process in parallel with concurrency limit of 5
    const CONCURRENCY_LIMIT = 5;
    const created = [];

    for (let i = 0; i < tasks.length; i += CONCURRENCY_LIMIT) {
      const batch = tasks.slice(i, i + CONCURRENCY_LIMIT);
      const batchResults = await Promise.all(
        batch.map(task =>
          this.request("POST", "/tasks", { ...task, project_id: projectId })
            .catch(error => {
              console.error('[TodoistApi] Failed to create task in batch', {
                content: task.content,
                error: error instanceof Error ? error.message : String(error)
              });
              throw error;
            })
        )
      );
      created.push(...batchResults);
    }

    console.debug('[TodoistApi] Batch creation complete', {
      projectId,
      successCount: created.length,
      timestamp: new Date().toISOString()
    });

    return created;
  }
}