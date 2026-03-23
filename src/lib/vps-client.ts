export interface SystemStats {
  hostname: string;
  platform: string;
  distro: string;
  uptime: number;
  cpu: { usage: number; cores: number; model: string };
  memory: { total: number; used: number; free: number; usagePercent: number };
  disk: { total: number; used: number; free: number; usagePercent: number } | null;
}

export interface PM2Process {
  pm_id: number;
  name: string;
  status: string;
  cpu: number;
  memory: number;
  uptime: number;
  restarts: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class VpsClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(host: string, port: number, apiKey: string) {
    this.baseUrl = `http://${host}:${port}`;
    this.apiKey = apiKey;
  }

  async request<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
          ...options?.headers,
        },
        signal: AbortSignal.timeout(10000),
      });

      // Check if we got HTML back (404 page) instead of JSON
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        return { success: false, error: `Endpoint returned ${response.status} (non-JSON response)` };
      }

      return await response.json();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Request failed" };
    }
  }

  async health(): Promise<{ status: string } | null> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return await response.json();
      return null;
    } catch {
      return null;
    }
  }

  async getSystemStats(): Promise<ApiResponse<SystemStats>> {
    return this.request("/api/system/stats");
  }

  async listProcesses(): Promise<ApiResponse<PM2Process[]>> {
    return this.request("/api/pm2/list");
  }

  async startProcess(script: string, options?: { name?: string; cwd?: string }): Promise<ApiResponse<unknown>> {
    return this.request("/api/pm2/start", { method: "POST", body: JSON.stringify({ script, ...options }) });
  }

  async stopProcess(name: string): Promise<ApiResponse<unknown>> {
    return this.request(`/api/pm2/stop/${name}`, { method: "POST" });
  }

  async restartProcess(name: string): Promise<ApiResponse<unknown>> {
    return this.request(`/api/pm2/restart/${name}`, { method: "POST" });
  }

  async deleteProcess(name: string): Promise<ApiResponse<unknown>> {
    return this.request(`/api/pm2/delete/${name}`, { method: "DELETE" });
  }

  async runNpmScript(cwd: string, script: string, name?: string): Promise<ApiResponse<unknown>> {
    return this.request("/api/pm2/run-script", { method: "POST", body: JSON.stringify({ cwd, script, name }) });
  }

  // ---- File system methods ----
  // Agent exposes: GET /api/files/read?path=..., POST /api/files/write, GET /api/files/list?path=...

  /** Read a file from VPS — uses GET /api/files/read?path=... */
  async readFile(filePath: string): Promise<ApiResponse<{ content: string }>> {
    return this.request(`/api/files/read?path=${encodeURIComponent(filePath)}`);
  }

  /** Write a file on VPS — uses POST /api/files/write */
  async writeFile(filePath: string, content: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.request("/api/files/write", {
      method: "POST",
      body: JSON.stringify({ path: filePath, content }),
    });
  }

  /** Check if a path exists on VPS — uses GET /api/files/list?path=... on the parent dir */
  async pathExists(filePath: string): Promise<ApiResponse<{ exists: boolean; isDirectory: boolean; isEmpty?: boolean }>> {
    // Try to read the file/dir info via /api/files/list on parent
    // Or simply try readFile and check the response
    const result = await this.request<{ path: string; files: { name: string; isDirectory: boolean }[]; count: number }>(
      `/api/files/list?path=${encodeURIComponent(filePath)}`
    );

    if (result.success && result.data) {
      // Path exists and is a directory
      return {
        success: true,
        data: { exists: true, isDirectory: true, isEmpty: result.data.count === 0 },
      };
    }

    // Maybe it's a file — try reading it
    const readResult = await this.readFile(filePath);
    if (readResult.success) {
      return { success: true, data: { exists: true, isDirectory: false } };
    }

    return { success: true, data: { exists: false, isDirectory: false } };
  }

  /** Execute a shell command on the VPS — uses POST /api/exec */
  async exec(command: string, cwd?: string, timeout?: number): Promise<ApiResponse<{ stdout: string; stderr: string; exitCode: number }>> {
    return this.request("/api/exec", {
      method: "POST",
      body: JSON.stringify({ command, cwd, timeout }),
      signal: AbortSignal.timeout(timeout || 300000),
    } as RequestInit);
  }

  /** List docker containers on VPS */
  async listContainers(): Promise<ApiResponse<{ id: string; name: string; status: string; image: string }[]>> {
    return this.request("/api/docker/containers");
  }

  /**
   * Get PM2 process status by name.
   * Uses /api/pm2/list and filters by name.
   */
  async getProcessStatus(name: string): Promise<ApiResponse<PM2Process | null>> {
    const result = await this.listProcesses();
    if (!result.success || !result.data) {
      return { success: false, error: result.error || "Failed to list processes" };
    }
    const process = result.data.find((p) => p.name === name);
    if (!process) {
      return { success: true, data: null };
    }
    return { success: true, data: process };
  }
}

export function createVpsClient(host: string, port: number, apiKey: string): VpsClient {
  return new VpsClient(host, port, apiKey);
}
