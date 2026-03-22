import { VpsClient } from "@/lib/vps-client";
import { io, type Socket } from "socket.io-client";
import type { AutomationNodeData } from "@/types/automation";

export interface ExecutorContext {
  client: VpsClient;
  rootPath: string;
  envPath: string | null;
  nodeData: AutomationNodeData;
  onLog: (line: string) => void;
  signal: AbortSignal;
  /** Flush current logs to DB — called periodically during long polls */
  flushLogs: () => Promise<void>;
  /** VPS connection info for socket.io */
  vpsHost: string;
  vpsAgentPort: number;
  vpsApiKey: string;
}

export interface ExecutorResult {
  success: boolean;
  error?: string;
}

export type Executor = (ctx: ExecutorContext) => Promise<ExecutorResult>;

// ---- Poll interval (15 seconds) ----
const POLL_INTERVAL_MS = 15_000;

/**
 * Write env vars to the .env file on the VPS before executing
 */
export async function applyEnvVars(ctx: ExecutorContext): Promise<void> {
  const envVars = ctx.nodeData.envVars;
  if (!envVars || envVars.length === 0 || !ctx.envPath) return;

  ctx.onLog(`[env] Mise à jour de ${ctx.envPath}...`);

  // Read current .env
  const readResult = await ctx.client.readFile(ctx.envPath);
  let content = readResult.success && readResult.data ? readResult.data.content : "";

  // Update or append each variable
  for (const { key, value } of envVars) {
    if (!key.trim()) continue;
    const regex = new RegExp(`^${escapeRegex(key)}=.*$`, "m");
    const newLine = `${key}='${value}'`;

    if (regex.test(content)) {
      content = content.replace(regex, newLine);
    } else {
      content = content.trimEnd() + "\n" + newLine + "\n";
    }
    ctx.onLog(`[env] ${key}=${value}`);
  }

  // Write back
  await ctx.client.writeFile(ctx.envPath, content);
  ctx.onLog(`[env] .env mis à jour`);
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ==========================================
// PM2 Script Executor
// ==========================================
// Strategy:
//   1. Start pm2 process via POST /api/pm2/run-script
//   2. Connect Socket.IO for real-time logs (same as /dashboard/logs page)
//   3. Poll status every 15s via GET /api/pm2/list + filter by name
//      - "online"  → still running, continue polling
//      - "stopped" → script finished successfully (--no-autorestart)
//      - "errored" → script crashed
//      - not found → deleted externally, treat as success
//   4. Flush logs to DB every 15s so frontend can display them
export async function executePm2Script(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as { pm2Name: string; npmCommand: string; scriptFile: string };
  let socket: Socket | null = null;

  try {
    await applyEnvVars(ctx);

    const pm2Name = config.pm2Name || "automation-task";
    const npmCommand = config.npmCommand;

    ctx.onLog(`[pm2] Démarrage: pm2 start npm --name "${pm2Name}" --no-autorestart -- run ${npmCommand}`);
    ctx.onLog(`[pm2] CWD: ${ctx.rootPath}`);

    // Start PM2 process
    const startResult = await ctx.client.runNpmScript(ctx.rootPath, npmCommand, pm2Name);
    if (!startResult.success) {
      return { success: false, error: startResult.error || "Failed to start PM2 process" };
    }

    ctx.onLog(`[pm2] Processus "${pm2Name}" démarré`);
    await ctx.flushLogs();

    // --- Connect Socket.IO for real-time logs ---
    socket = io(`http://${ctx.vpsHost}:${ctx.vpsAgentPort}`, {
      auth: { apiKey: ctx.vpsApiKey },
      reconnection: true,
      reconnectionAttempts: 10,
      timeout: 10000,
    });

    let socketConnected = false;

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        ctx.onLog(`[pm2] ⚠ Socket.IO: connexion timeout — logs temps réel indisponibles`);
        resolve();
      }, 5000);

      socket!.on("connect", () => {
        socketConnected = true;
        clearTimeout(timeout);
        ctx.onLog(`[pm2] Socket.IO connecté — logs temps réel activés`);
        socket!.emit("logs:subscribe", { processName: pm2Name });
        resolve();
      });

      socket!.on("connect_error", (err) => {
        clearTimeout(timeout);
        ctx.onLog(`[pm2] ⚠ Socket.IO erreur: ${err.message}`);
        resolve();
      });
    });

    // Listen for real-time log events from Socket.IO
    if (socketConnected) {
      socket.on("logs:data", (log: { timestamp: string; type: "out" | "err"; data: string }) => {
        const prefix = log.type === "err" ? "[pm2:err]" : "[pm2:log]";
        ctx.onLog(`${prefix} ${log.data}`);
      });
    }

    // --- Poll status every 15s via /api/pm2/list ---
    const maxCycles = 2400; // 2400 * 15s = 10h max

    for (let cycle = 0; cycle < maxCycles; cycle++) {
      if (ctx.signal.aborted) {
        ctx.onLog(`[pm2] Arrêt demandé, suppression du processus...`);
        await ctx.client.deleteProcess(pm2Name);
        return { success: false, error: "Exécution annulée" };
      }

      await sleep(POLL_INTERVAL_MS);

      // --- Check process status (via /api/pm2/list + filter) ---
      const statusResult = await ctx.client.getProcessStatus(pm2Name);

      if (!statusResult.success) {
        // API call failed (network issue, agent down)
        ctx.onLog(`[pm2] ⚠ Erreur API: ${statusResult.error} — on réessaie...`);
        await ctx.flushLogs();
        continue; // Don't fail, retry next cycle
      }

      if (!statusResult.data) {
        // Process not in pm2 list = deleted externally or never existed
        ctx.onLog(`[pm2] Processus "${pm2Name}" introuvable dans pm2 list`);
        // Wait for last socket logs
        if (socketConnected) await sleep(2000);
        await ctx.flushLogs();
        return { success: true };
      }

      const status = statusResult.data.status;
      const elapsedMin = Math.floor(((cycle + 1) * POLL_INTERVAL_MS) / 60000);

      // --- online = still running ---
      if (status === "online") {
        ctx.onLog(`[pm2] ⏳ En cours... (${elapsedMin}min) — CPU: ${statusResult.data.cpu || 0}% | MEM: ${formatBytes(statusResult.data.memory || 0)}`);
        await ctx.flushLogs();
        continue;
      }

      // --- stopped = script a fini avec succès (--no-autorestart) ---
      if (status === "stopped") {
        // Wait for last socket logs to arrive
        if (socketConnected) await sleep(3000);

        await ctx.client.deleteProcess(pm2Name);
        ctx.onLog(`[pm2] ✓ Processus "${pm2Name}" terminé avec succès (${elapsedMin}min)`);
        await ctx.flushLogs();
        return { success: true };
      }

      // --- errored = script a crashé ---
      if (status === "errored") {
        if (socketConnected) await sleep(3000);

        await ctx.client.deleteProcess(pm2Name);
        ctx.onLog(`[pm2] ✗ Processus "${pm2Name}" terminé en ERREUR (${elapsedMin}min)`);
        await ctx.flushLogs();
        return { success: false, error: `PM2 process "${pm2Name}" ended with error` };
      }

      // --- Other status (launching, waiting-restart, etc) = keep waiting ---
      ctx.onLog(`[pm2] Status: ${status} (${elapsedMin}min)`);
      await ctx.flushLogs();
    }

    // Max time exceeded — kill process
    ctx.onLog(`[pm2] ✗ TIMEOUT: dépassement des 10h, arrêt forcé`);
    await ctx.client.deleteProcess(pm2Name);
    await ctx.flushLogs();
    return { success: false, error: "Timeout: le processus PM2 a dépassé 10h" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "PM2 executor error" };
  } finally {
    // Always cleanup socket connection
    if (socket) {
      try {
        socket.emit("logs:unsubscribe", { processName: config.pm2Name || "automation-task" });
        socket.disconnect();
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

// ==========================================
// SSH Command Executor
// ==========================================
// One-shot command — wait for exit code
export async function executeSshCommand(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as {
    mode: string;
    rawCommand?: string;
    dockerContainer?: string;
    dockerCommand?: string;
    query?: string;
    outputFile?: string;
  };

  try {
    await applyEnvVars(ctx);

    let command: string;

    if (config.mode === "structured" && config.dockerContainer) {
      const parts = [`docker exec -i ${config.dockerContainer}`];
      if (config.dockerCommand) parts.push(config.dockerCommand);
      if (config.query) {
        parts.push(`--query="${config.query}"`);
      }
      command = parts.join(" ");

      if (config.outputFile) {
        command += ` > ${config.outputFile}`;
      }
    } else {
      command = config.rawCommand || "";
    }

    if (!command.trim()) {
      return { success: false, error: "Aucune commande à exécuter" };
    }

    ctx.onLog(`[ssh] Exécution: ${command}`);
    ctx.onLog(`[ssh] CWD: ${ctx.rootPath}`);
    await ctx.flushLogs();

    const result = await ctx.client.exec(command, ctx.rootPath, 600000);

    if (result.success && result.data) {
      if (result.data.stdout) {
        const lines = result.data.stdout.split("\n").slice(-20);
        for (const line of lines) {
          ctx.onLog(`[ssh:out] ${line}`);
        }
      }
      if (result.data.stderr) {
        const lines = result.data.stderr.split("\n").slice(-10);
        for (const line of lines) {
          ctx.onLog(`[ssh:err] ${line}`);
        }
      }

      if (result.data.exitCode !== 0) {
        await ctx.flushLogs();
        return { success: false, error: `Exit code: ${result.data.exitCode}` };
      }

      ctx.onLog(`[ssh] Commande terminée avec succès`);
      await ctx.flushLogs();
      return { success: true };
    }

    return { success: false, error: result.error || "SSH execution failed" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "SSH executor error" };
  }
}

// ==========================================
// SCP Transfer Executor
// ==========================================
export async function executeScpTransfer(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as {
    sourceVpsId: string;
    sourcePath: string;
    destVpsId: string;
    destPath: string;
  };

  try {
    const command = `scp ${config.sourcePath} ${config.destPath}`;

    ctx.onLog(`[scp] Transfert: ${config.sourcePath} → ${config.destPath}`);
    await ctx.flushLogs();

    const result = await ctx.client.exec(command, ctx.rootPath, 600000);

    if (result.success && result.data) {
      if (result.data.exitCode !== 0) {
        ctx.onLog(`[scp:err] ${result.data.stderr}`);
        await ctx.flushLogs();
        return { success: false, error: `SCP failed: ${result.data.stderr}` };
      }
      ctx.onLog(`[scp] Transfert terminé`);
      await ctx.flushLogs();
      return { success: true };
    }

    return { success: false, error: result.error || "SCP failed" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "SCP executor error" };
  }
}

// ==========================================
// DB Export Executor
// ==========================================
export async function executeDbExport(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as {
    dockerContainer: string;
    query: string;
    outputFile: string;
  };

  try {
    const command = `docker exec -i ${config.dockerContainer} clickhouse client --query="${config.query}" > ${config.outputFile}`;

    ctx.onLog(`[db-export] Container: ${config.dockerContainer}`);
    ctx.onLog(`[db-export] Query: ${config.query}`);
    ctx.onLog(`[db-export] Output: ${config.outputFile}`);
    await ctx.flushLogs();

    const result = await ctx.client.exec(command, ctx.rootPath, 600000);

    if (result.success && result.data) {
      if (result.data.exitCode !== 0) {
        ctx.onLog(`[db-export:err] ${result.data.stderr}`);
        await ctx.flushLogs();
        return { success: false, error: `DB Export failed: ${result.data.stderr}` };
      }
      ctx.onLog(`[db-export] Export terminé`);
      await ctx.flushLogs();
      return { success: true };
    }

    return { success: false, error: result.error || "DB Export failed" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "DB Export error" };
  }
}

// ==========================================
// DB Import Executor
// ==========================================
export async function executeDbImport(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as {
    scriptPath: string;
    variables: { key: string; value: string }[];
  };

  try {
    const envParts = (config.variables || [])
      .filter((v) => v.key.trim())
      .map((v) => `${v.key}="${v.value}"`)
      .join(" \\\n");

    const command = envParts
      ? `${envParts} \\\nbash ${config.scriptPath}`
      : `bash ${config.scriptPath}`;

    ctx.onLog(`[db-import] Script: ${config.scriptPath}`);
    for (const v of config.variables || []) {
      ctx.onLog(`[db-import] ${v.key}=${v.value}`);
    }
    await ctx.flushLogs();

    const result = await ctx.client.exec(command, ctx.rootPath, 600000);

    if (result.success && result.data) {
      if (result.data.stdout) {
        const lines = result.data.stdout.split("\n").slice(-15);
        for (const line of lines) ctx.onLog(`[db-import] ${line}`);
      }
      if (result.data.exitCode !== 0) {
        ctx.onLog(`[db-import:err] ${result.data.stderr}`);
        await ctx.flushLogs();
        return { success: false, error: `DB Import failed: exit code ${result.data.exitCode}` };
      }
      ctx.onLog(`[db-import] Import terminé`);
      await ctx.flushLogs();
      return { success: true };
    }

    return { success: false, error: result.error || "DB Import failed" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "DB Import error" };
  }
}

// ==========================================
// Tippecanoe Executor (sans nohup)
// ==========================================
export async function executeTippecanoe(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as {
    inputFiles: string[];
    minZoom: number;
    maxZoom: number;
    extraFlags: string[];
  };

  try {
    const results: { file: string; success: boolean; error?: string }[] = [];

    for (const inputFile of config.inputFiles || []) {
      const outputFile = inputFile.replace(/\.geojson$/, ".pmtiles");
      const flags = [
        `-o ${outputFile}`,
        `--minimum-zoom=${config.minZoom || 14}`,
        `--maximum-zoom=${config.maxZoom || 22}`,
        ...(config.extraFlags || []),
        inputFile,
      ].join(" ");

      const command = `tippecanoe ${flags}`;

      ctx.onLog(`[tippecanoe] ${inputFile} → ${outputFile}`);
      ctx.onLog(`[tippecanoe] Commande: ${command}`);
      await ctx.flushLogs();

      const result = await ctx.client.exec(command, ctx.rootPath, 3600000);

      if (result.success && result.data) {
        if (result.data.stdout) {
          const lines = result.data.stdout.split("\n").slice(-10);
          for (const line of lines) ctx.onLog(`[tippecanoe:out] ${line}`);
        }
        if (result.data.exitCode === 0) {
          ctx.onLog(`[tippecanoe] ✓ ${inputFile} terminé`);
          results.push({ file: inputFile, success: true });
        } else {
          const error = result.data.stderr || "Unknown error";
          ctx.onLog(`[tippecanoe:err] ${inputFile}: ${error}`);
          results.push({ file: inputFile, success: false, error });
        }
      } else {
        const error = result.error || "Execution failed";
        ctx.onLog(`[tippecanoe:err] ${inputFile}: ${error}`);
        results.push({ file: inputFile, success: false, error });
      }

      await ctx.flushLogs();
    }

    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      return { success: false, error: `Tippecanoe failed for: ${failed.map((f) => f.file).join(", ")}` };
    }

    ctx.onLog(`[tippecanoe] ✓ Toutes les tuiles générées`);
    await ctx.flushLogs();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Tippecanoe error" };
  }
}

// ==========================================
// S3/R2 Upload Executor
// ==========================================
export async function executeS3Upload(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as {
    files: { source: string; destKey: string }[];
    bucket: string;
    endpoint: string;
    profile: string;
    prefix: string;
  };

  try {
    const total = (config.files || []).length;

    for (let i = 0; i < total; i++) {
      const file = config.files[i];
      const destKey = file.destKey || `${config.prefix || ""}${file.source}`;
      const command = `aws s3 cp ${file.source} s3://${config.bucket}/${destKey} --endpoint-url ${config.endpoint} --profile ${config.profile}`;

      ctx.onLog(`[s3] (${i + 1}/${total}) Upload: ${file.source} → s3://${config.bucket}/${destKey}`);
      await ctx.flushLogs();

      const result = await ctx.client.exec(command, ctx.rootPath, 300000);

      if (!result.success || (result.data && result.data.exitCode !== 0)) {
        const error = result.data?.stderr || result.error || "Upload failed";
        ctx.onLog(`[s3:err] ${error}`);
        await ctx.flushLogs();
        return { success: false, error: `S3 upload failed for ${file.source}: ${error}` };
      }

      ctx.onLog(`[s3] ✓ ${file.source} uploadé`);
    }

    ctx.onLog(`[s3] ✓ Tous les fichiers uploadés (${total})`);
    await ctx.flushLogs();
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "S3 upload error" };
  }
}

// ==========================================
// Helpers
// ==========================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
