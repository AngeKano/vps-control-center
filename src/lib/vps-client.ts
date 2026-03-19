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

  private async request<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
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
}

export function createVpsClient(host: string, port: number, apiKey: string): VpsClient {
  return new VpsClient(host, port, apiKey);
}
