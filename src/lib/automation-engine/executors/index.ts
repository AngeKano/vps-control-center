import { VpsClient } from "@/lib/vps-client";
import { io, type Socket } from "socket.io-client";
import type { AutomationNodeData } from "@/types/automation";

export interface VpsInfo {
  id: string;
  label: string;
  rootPath: string;
  host: string;
  username: string;
  agentPort: number;
  client: VpsClient;
}

export interface ExecutorContext {
  client: VpsClient;
  rootPath: string;
  nodeData: AutomationNodeData;
  nodeId: string;
  onLog: (line: string) => void;
  signal: AbortSignal;
  flushLogs: () => Promise<void>;
  vpsHost: string;
  vpsAgentPort: number;
  vpsApiKey: string;
  registerPm2: (pm2Name: string) => void;
  unregisterPm2: () => void;
  allVps: Map<string, VpsInfo>;
}

export interface ExecutorResult {
  success: boolean;
  error?: string;
}

export type Executor = (ctx: ExecutorContext) => Promise<ExecutorResult>;

const POLL_INTERVAL_MS = 15_000;

// ==========================================
// STRATEGY: How commands are executed
// ==========================================
// The VPS agent provides 2 ways to run commands:
//
// 1. POST /api/exec — Synchronous shell execution (child_process.exec)
//    - Good for: short commands (< 10min), DB export, SCP, docker, bash scripts
//    - Returns: { stdout, stderr, exitCode }
//    - Blocks until command finishes
//
// 2. POST /api/pm2/run-script + poll /api/pm2/list — Async PM2 process
//    - Good for: long-running npm scripts (download, insert, process, geojson...)
//    - Returns immediately, poll for status
//    - Supports Socket.IO log streaming
//
// If /api/exec returns 404 (agent not updated), fall back to PM2 approach.

// ==========================================
// Run a command via /api/exec (synchronous)
// Falls back to PM2 if /api/exec is unavailable
// ==========================================
async function runCommand(opts: {
  client: VpsClient;
  command: string;
  cwd: string;
  timeout?: number;
  logPrefix: string;
  onLog: (line: string) => void;
  flushLogs: () => Promise<void>;
  signal: AbortSignal;
  // PM2 fallback params
  pm2Name: string;
  registerPm2: (name: string) => void;
  unregisterPm2: () => void;
  vpsHost?: string;
  vpsAgentPort?: number;
  vpsApiKey?: string;
}): Promise<ExecutorResult> {
  const { client, command, cwd, timeout = 600000, logPrefix, onLog, flushLogs, signal } = opts;

  // Try /api/exec first
  onLog(`${logPrefix} Commande: ${command}`);
  onLog(`${logPrefix} CWD: ${cwd}`);
  await flushLogs();

  const execResult = await client.exec(command, cwd, timeout);

  // If exec succeeded (endpoint exists)
  if (execResult.success && execResult.data) {
    if (execResult.data.stdout) {
      const lines = execResult.data.stdout.split("\n").filter((l: string) => l.trim()).slice(-30);
      for (const line of lines) onLog(`${logPrefix}:out ${line}`);
    }
    if (execResult.data.stderr) {
      const lines = execResult.data.stderr.split("\n").filter((l: string) => l.trim()).slice(-15);
      for (const line of lines) onLog(`${logPrefix}:err ${line}`);
    }

    if (execResult.data.exitCode !== 0) {
      await flushLogs();
      return { success: false, error: `Exit code: ${execResult.data.exitCode}` };
    }

    onLog(`${logPrefix} ✓ Terminé`);
    await flushLogs();
    return { success: true };
  }

  // If /api/exec returned 404 (agent not updated), fall back to PM2
  if (execResult.error?.includes("404") || execResult.error?.includes("non-JSON")) {
    onLog(`${logPrefix} /api/exec indisponible — fallback PM2`);
    return runCommandViaPm2(opts);
  }

  // Other error
  return { success: false, error: execResult.error || "Exec failed" };
}

// ==========================================
// Fallback: Run command as PM2 process
// ==========================================
async function runCommandViaPm2(opts: {
  client: VpsClient;
  command: string;
  cwd: string;
  pm2Name: string;
  logPrefix: string;
  timeout?: number;
  signal: AbortSignal;
  onLog: (line: string) => void;
  flushLogs: () => Promise<void>;
  registerPm2: (name: string) => void;
  unregisterPm2: () => void;
  vpsHost?: string;
  vpsAgentPort?: number;
  vpsApiKey?: string;
}): Promise<ExecutorResult> {
  const {
    client, command, cwd, pm2Name, logPrefix,
    timeout = 600000, signal, onLog, flushLogs,
    registerPm2, unregisterPm2, vpsHost, vpsAgentPort, vpsApiKey,
  } = opts;

  let socket: Socket | null = null;
  const maxDuration = Math.ceil(timeout / 1000);
  // Temp file to capture exit code (PM2 "stopped" doesn't distinguish exit 0 vs exit 1)
  const exitCodeFile = `/tmp/.pm2-exit-${pm2Name}`;

  try {
    onLog(`${logPrefix} Lancement PM2 "${pm2Name}"...`);
    await flushLogs();

    // Wrap command to capture exit code:
    // 1. Run the actual command
    // 2. Save $? to a temp file
    // 3. Exit with the same code
    const escaped = command.replace(/'/g, "'\\''");
    const wrappedCommand = `${escaped}; __EXIT=$?; echo $__EXIT > ${exitCodeFile}; exit $__EXIT`;

    const startResult = await client.request<unknown>("/api/pm2/start", {
      method: "POST",
      body: JSON.stringify({
        script: "bash",
        args: ["-c", wrappedCommand],
        name: pm2Name,
        cwd,
        interpreter: "none",
        autorestart: false,
      }),
    });

    if (!startResult.success) {
      return { success: false, error: `PM2 start failed: ${startResult.error}` };
    }

    registerPm2(pm2Name);

    // Connect Socket.IO for logs (optional)
    let socketConnected = false;
    if (vpsHost && vpsAgentPort && vpsApiKey) {
      try {
        socket = io(`http://${vpsHost}:${vpsAgentPort}`, {
          auth: { apiKey: vpsApiKey },
          reconnection: false,
          timeout: 4000,
        });
        await new Promise<void>((resolve) => {
          const t = setTimeout(() => resolve(), 3000);
          socket!.on("connect", () => { socketConnected = true; clearTimeout(t); socket!.emit("logs:subscribe", { processName: pm2Name }); resolve(); });
          socket!.on("connect_error", () => { clearTimeout(t); resolve(); });
        });
        if (socketConnected) {
          socket.on("logs:data", (log: { type: "out" | "err"; data: string }) => {
            onLog(`${logPrefix}:${log.type === "err" ? "err" : "log"} ${log.data}`);
          });
        }
      } catch { /* optional */ }
    }

    // Poll PM2 status
    const maxCycles = Math.ceil(maxDuration / (POLL_INTERVAL_MS / 1000));

    for (let cycle = 0; cycle < maxCycles; cycle++) {
      if (signal.aborted) {
        await client.deleteProcess(pm2Name);
        cleanup(client, exitCodeFile);
        return { success: false, error: "Exécution annulée" };
      }

      await sleep(POLL_INTERVAL_MS);

      const statusResult = await client.getProcessStatus(pm2Name);
      if (!statusResult.success) { await flushLogs(); continue; }
      if (!statusResult.data) {
        // Process gone — check exit code file
        const exitCode = await readExitCode(client, exitCodeFile);
        await cleanup(client, exitCodeFile);
        if (exitCode !== null && exitCode !== 0) {
          onLog(`${logPrefix} ✗ Commande échouée (exit code: ${exitCode})`);
          await flushLogs();
          return { success: false, error: `Exit code: ${exitCode}` };
        }
        await flushLogs();
        return { success: true };
      }

      const status = statusResult.data.status;
      const elapsedMin = Math.floor(((cycle + 1) * POLL_INTERVAL_MS) / 60000);

      if (status === "online") {
        onLog(`${logPrefix} ⏳ En cours... (${elapsedMin}min)`);
        await flushLogs();
        continue;
      }

      // Process finished (stopped or errored) — check REAL exit code
      if (status === "stopped" || status === "errored") {
        if (socketConnected) await sleep(2000);

        // Read exit code from temp file
        const exitCode = await readExitCode(client, exitCodeFile);
        await client.deleteProcess(pm2Name);
        await cleanup(client, exitCodeFile);

        if (exitCode !== null && exitCode !== 0) {
          onLog(`${logPrefix} ✗ Commande échouée — exit code: ${exitCode} (${elapsedMin}min)`);
          await flushLogs();
          return { success: false, error: `Commande échouée (exit code: ${exitCode})` };
        }

        if (status === "errored" && exitCode === null) {
          // PM2 says errored but no exit code file — something bad happened
          onLog(`${logPrefix} ✗ Erreur PM2 (${elapsedMin}min)`);
          await flushLogs();
          return { success: false, error: "Commande échouée (PM2 errored)" };
        }

        onLog(`${logPrefix} ✓ Terminé (${elapsedMin}min)`);
        await flushLogs();
        return { success: true };
      }

      onLog(`${logPrefix} Status: ${status} (${elapsedMin}min)`);
      await flushLogs();
    }

    await client.deleteProcess(pm2Name);
    await cleanup(client, exitCodeFile);
    return { success: false, error: `Timeout (>${Math.floor(maxDuration / 60)}min)` };
  } catch (error) {
    try { await client.deleteProcess(pm2Name); } catch { /* ignore */ }
    await cleanup(client, exitCodeFile);
    return { success: false, error: error instanceof Error ? error.message : "Execution error" };
  } finally {
    unregisterPm2();
    if (socket) { try { socket.disconnect(); } catch { /* ignore */ } }
  }
}

/** Read exit code from temp file left by the PM2 wrapper */
async function readExitCode(client: VpsClient, filePath: string): Promise<number | null> {
  try {
    const result = await client.readFile(filePath);
    if (result.success && result.data?.content) {
      const code = parseInt(result.data.content.trim(), 10);
      return isNaN(code) ? null : code;
    }
  } catch { /* ignore */ }
  return null;
}

/** Clean up the temp exit code file */
async function cleanup(client: VpsClient, filePath: string): Promise<void> {
  try {
    await client.exec(`rm -f ${filePath}`, "/tmp", 5000);
  } catch { /* ignore */ }
}

// ==========================================
// PM2 Script Executor (npm scripts)
// ==========================================
// Uses dedicated /api/pm2/run-script + Socket.IO logs + poll
export async function executePm2Script(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as { pm2Name: string; npmCommand: string; scriptFile: string };
  let socket: Socket | null = null;

  try {
    const pm2Name = config.pm2Name || "automation-task";
    const npmCommand = config.npmCommand;

    ctx.onLog(`[pm2] Démarrage: pm2 start npm --name "${pm2Name}" --no-autorestart -- run ${npmCommand}`);
    ctx.onLog(`[pm2] CWD: ${ctx.rootPath}`);

    const startResult = await ctx.client.runNpmScript(ctx.rootPath, npmCommand, pm2Name);
    if (!startResult.success) {
      return { success: false, error: startResult.error || "Failed to start PM2 process" };
    }

    ctx.registerPm2(pm2Name);
    ctx.onLog(`[pm2] Processus "${pm2Name}" démarré`);
    await ctx.flushLogs();

    // Socket.IO for real-time logs
    socket = io(`http://${ctx.vpsHost}:${ctx.vpsAgentPort}`, {
      auth: { apiKey: ctx.vpsApiKey },
      reconnection: true,
      reconnectionAttempts: 10,
      timeout: 10000,
    });

    let socketConnected = false;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => { ctx.onLog(`[pm2] ⚠ Socket.IO timeout`); resolve(); }, 5000);
      socket!.on("connect", () => {
        socketConnected = true; clearTimeout(timeout);
        ctx.onLog(`[pm2] Socket.IO connecté — logs temps réel`);
        socket!.emit("logs:subscribe", { processName: pm2Name });
        resolve();
      });
      socket!.on("connect_error", (err) => { clearTimeout(timeout); ctx.onLog(`[pm2] ⚠ Socket.IO: ${err.message}`); resolve(); });
    });

    if (socketConnected) {
      socket.on("logs:data", (log: { timestamp: string; type: "out" | "err"; data: string }) => {
        ctx.onLog(`[pm2:${log.type === "err" ? "err" : "log"}] ${log.data}`);
      });
    }

    // Poll status every 15s — max 10h
    const maxCycles = 2400;
    for (let cycle = 0; cycle < maxCycles; cycle++) {
      if (ctx.signal.aborted) {
        ctx.onLog(`[pm2] Arrêt demandé`);
        await ctx.client.deleteProcess(pm2Name);
        return { success: false, error: "Exécution annulée" };
      }

      await sleep(POLL_INTERVAL_MS);
      const statusResult = await ctx.client.getProcessStatus(pm2Name);

      if (!statusResult.success) { ctx.onLog(`[pm2] ⚠ API error — retry`); await ctx.flushLogs(); continue; }
      if (!statusResult.data) { if (socketConnected) await sleep(2000); await ctx.flushLogs(); return { success: true }; }

      const status = statusResult.data.status;
      const elapsedMin = Math.floor(((cycle + 1) * POLL_INTERVAL_MS) / 60000);

      if (status === "online") {
        ctx.onLog(`[pm2] ⏳ En cours... (${elapsedMin}min) — CPU: ${statusResult.data.cpu || 0}% | MEM: ${formatBytes(statusResult.data.memory || 0)}`);
        await ctx.flushLogs();
        continue;
      }
      if (status === "stopped") {
        if (socketConnected) await sleep(3000);
        await ctx.client.deleteProcess(pm2Name);
        ctx.onLog(`[pm2] ✓ "${pm2Name}" terminé avec succès (${elapsedMin}min)`);
        await ctx.flushLogs();
        return { success: true };
      }
      if (status === "errored") {
        if (socketConnected) await sleep(3000);
        await ctx.client.deleteProcess(pm2Name);
        ctx.onLog(`[pm2] ✗ "${pm2Name}" en ERREUR (${elapsedMin}min)`);
        await ctx.flushLogs();
        return { success: false, error: `PM2 "${pm2Name}" errored` };
      }

      ctx.onLog(`[pm2] Status: ${status} (${elapsedMin}min)`);
      await ctx.flushLogs();
    }

    await ctx.client.deleteProcess(pm2Name);
    return { success: false, error: "Timeout: > 10h" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "PM2 executor error" };
  } finally {
    ctx.unregisterPm2();
    if (socket) { try { socket.disconnect(); } catch { /* ignore */ } }
  }
}

// ==========================================
// SSH Command Executor
// ==========================================
export async function executeSshCommand(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as {
    mode: string; rawCommand?: string; dockerContainer?: string;
    dockerCommand?: string; query?: string; outputFile?: string;
  };

  let command: string;
  if (config.mode === "structured" && config.dockerContainer) {
    const parts = [`docker exec -i ${config.dockerContainer}`];
    if (config.dockerCommand) parts.push(config.dockerCommand);
    if (config.query) parts.push(`--query="${config.query}"`);
    command = parts.join(" ");
    if (config.outputFile) command += ` > ${config.outputFile}`;
  } else {
    command = config.rawCommand || "";
  }

  if (!command.trim()) return { success: false, error: "Aucune commande" };

  return runCommand({
    client: ctx.client, command, cwd: ctx.rootPath,
    logPrefix: "[ssh]", timeout: 600000, signal: ctx.signal,
    onLog: ctx.onLog, flushLogs: ctx.flushLogs,
    pm2Name: `ssh-${ctx.nodeId.slice(0, 8)}-${Date.now()}`,
    registerPm2: ctx.registerPm2, unregisterPm2: ctx.unregisterPm2,
    vpsHost: ctx.vpsHost, vpsAgentPort: ctx.vpsAgentPort, vpsApiKey: ctx.vpsApiKey,
  });
}

// ==========================================
// SCP Transfer Executor
// ==========================================
export async function executeScpTransfer(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as {
    sourceVpsId: string; sourcePath: string; destVpsId: string; destPath: string;
  };

  const sourceVps = ctx.allVps.get(config.sourceVpsId);
  const destVps = ctx.allVps.get(config.destVpsId);
  if (!sourceVps) return { success: false, error: `VPS source introuvable` };
  if (!destVps) return { success: false, error: `VPS destination introuvable` };

  const fullSourcePath = config.sourcePath.startsWith("/")
    ? config.sourcePath
    : `${sourceVps.rootPath}/${config.sourcePath}`;

  const command = `scp ${fullSourcePath} ${destVps.username}@${destVps.host}:${config.destPath}`;

  ctx.onLog(`[scp] ${sourceVps.label} → ${destVps.label}`);

  return runCommand({
    client: sourceVps.client, command, cwd: sourceVps.rootPath,
    logPrefix: "[scp]", timeout: 3600000, signal: ctx.signal,
    onLog: ctx.onLog, flushLogs: ctx.flushLogs,
    pm2Name: `scp-${ctx.nodeId.slice(0, 8)}-${Date.now()}`,
    registerPm2: ctx.registerPm2, unregisterPm2: ctx.unregisterPm2,
    vpsHost: sourceVps.host, vpsAgentPort: sourceVps.agentPort, vpsApiKey: ctx.vpsApiKey,
  });
}

// ==========================================
// DB Export Executor
// ==========================================
// ALWAYS uses PM2 (not /api/exec) because exports can take 30min-1h+
// /api/exec would timeout on large tables
export async function executeDbExport(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as { dockerContainer: string; query: string; outputFile: string };

  // Sanitize query: remove newlines, trim, ensure single line for --query
  const cleanQuery = (config.query || "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();

  const command = `docker exec -i ${config.dockerContainer} clickhouse client --query="${cleanQuery}" > ${config.outputFile}`;
  ctx.onLog(`[db-export] Container: ${config.dockerContainer}`);
  ctx.onLog(`[db-export] Query: ${cleanQuery}`);
  ctx.onLog(`[db-export] Output: ${config.outputFile}`);

  // Force PM2 mode — DB exports can be very long (30min+), /api/exec would timeout
  return runCommandViaPm2({
    client: ctx.client, command, cwd: ctx.rootPath,
    logPrefix: "[db-export]", timeout: 7200000, // 2h max
    signal: ctx.signal,
    onLog: ctx.onLog, flushLogs: ctx.flushLogs,
    pm2Name: `db-export-${ctx.nodeId.slice(0, 8)}-${Date.now()}`,
    registerPm2: ctx.registerPm2, unregisterPm2: ctx.unregisterPm2,
    vpsHost: ctx.vpsHost, vpsAgentPort: ctx.vpsAgentPort, vpsApiKey: ctx.vpsApiKey,
  });
}

// ==========================================
// DB Import Executor
// ==========================================
// ALWAYS uses PM2 — bash init scripts can take a long time
//
// Two modes:
// 1. User fills variables array + scriptPath (e.g. "./init.sh")
//    → command: DB_NAME="permis" TABLE_NAME="..." bash ./init.sh
// 2. User puts the FULL command in scriptPath (env vars + bash ./init.sh)
//    → command is used as-is
export async function executeDbImport(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as { scriptPath: string; variables: { key: string; value: string }[] };

  const hasVariables = (config.variables || []).some((v) => v.key.trim());
  let command: string;

  if (hasVariables) {
    // Variables provided via the form → prefix them before "bash scriptPath"
    const envParts = config.variables.filter((v) => v.key.trim()).map((v) => `${v.key}="${v.value}"`).join(" ");
    command = `${envParts} bash ${config.scriptPath}`;
    ctx.onLog(`[db-import] Script: ${config.scriptPath}`);
    for (const v of config.variables) {
      if (v.key.trim()) ctx.onLog(`[db-import] ${v.key}=${v.value}`);
    }
  } else {
    // No variables in the form → scriptPath IS the full command (may include inline env vars)
    command = config.scriptPath;
    ctx.onLog(`[db-import] Commande: ${config.scriptPath}`);
  }

  return runCommandViaPm2({
    client: ctx.client, command, cwd: ctx.rootPath,
    logPrefix: "[db-import]", timeout: 7200000, // 2h max
    signal: ctx.signal,
    onLog: ctx.onLog, flushLogs: ctx.flushLogs,
    pm2Name: `db-import-${ctx.nodeId.slice(0, 8)}-${Date.now()}`,
    registerPm2: ctx.registerPm2, unregisterPm2: ctx.unregisterPm2,
    vpsHost: ctx.vpsHost, vpsAgentPort: ctx.vpsAgentPort, vpsApiKey: ctx.vpsApiKey,
  });
}

// ==========================================
// Tippecanoe Executor
// ==========================================
// Generates a single .pmtiles file from a single .geojson file.
// Uses nohup + PM2 for long-running processes (can take hours on large files).
// Completion is detected via PM2 status polling + exit code capture.
export async function executeTippecanoe(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as {
    inputFile: string; outputDir: string; outputName: string;
    minZoom: number; maxZoom: number; dropRate: number; flags: string[];
  };

  if (!config.inputFile?.trim()) {
    return { success: false, error: "Fichier GeoJSON requis" };
  }

  // Resolve paths: relative paths are prefixed with rootPath
  // "pd.geojson"       → "/home/manu/.../tiles/permis/pd.geojson"
  // "/abs/pd.geojson"  → "/abs/pd.geojson"
  const resolve = (p: string) => p.startsWith("/") ? p : `${ctx.rootPath}/${p}`;

  const inputPath = resolve(config.inputFile.trim());
  const baseName = inputPath.replace(/^.*\//, "").replace(/\.geojson$/i, "");
  const outputName = (config.outputName?.trim()
    ? resolve(config.outputName.trim())
    : `${config.outputDir?.trim() ? resolve(config.outputDir.trim()) : ctx.rootPath}/${baseName}.pmtiles`
  );
  // If outputName was provided, ensure .pmtiles extension
  const outputPath = outputName.endsWith(".pmtiles") ? outputName : `${outputName}.pmtiles`;

  // Build command parts
  const parts: string[] = [
    "tippecanoe",
    `-o ${outputPath}`,
    `'--minimum-zoom=${config.minZoom ?? 14}'`,
    `'--maximum-zoom=${config.maxZoom ?? 22}'`,
    `'--drop-rate=${config.dropRate ?? 0}'`,
  ];

  // Add user flags (e.g. --no-feature-limit, --no-tile-size-limit, etc.)
  for (const flag of config.flags || []) {
    if (flag.trim()) parts.push(flag.trim());
  }

  // Input file last
  parts.push(inputPath);

  const command = parts.join(" ");

  ctx.onLog(`[tippecanoe] Input: ${inputPath}`);
  ctx.onLog(`[tippecanoe] Output: ${outputPath}`);
  ctx.onLog(`[tippecanoe] Zoom: ${config.minZoom ?? 14}-${config.maxZoom ?? 22} | Drop rate: ${config.dropRate ?? 0}`);
  ctx.onLog(`[tippecanoe] Flags: ${(config.flags || []).join(" ") || "(aucun)"}`);
  ctx.onLog(`[tippecanoe] Commande: ${command}`);

  // Force PM2 — tippecanoe can take hours on large geojson files
  const result = await runCommandViaPm2({
    client: ctx.client, command, cwd: ctx.rootPath,
    logPrefix: "[tippecanoe]", timeout: 14400000, // 4h max
    signal: ctx.signal,
    onLog: ctx.onLog, flushLogs: ctx.flushLogs,
    pm2Name: `tipp-${baseName.replace(/[^a-z0-9]/gi, "").slice(0, 12)}-${Date.now()}`,
    registerPm2: ctx.registerPm2, unregisterPm2: ctx.unregisterPm2,
    vpsHost: ctx.vpsHost, vpsAgentPort: ctx.vpsAgentPort, vpsApiKey: ctx.vpsApiKey,
  });

  if (!result.success) {
    ctx.onLog(`[tippecanoe] ✗ Échec: ${result.error}`);
    await ctx.flushLogs();
    return result;
  }

  ctx.onLog(`[tippecanoe] ✓ Tuile générée: ${outputPath}`);
  await ctx.flushLogs();
  return { success: true };
}

// ==========================================
// S3/R2 Upload Executor
// ==========================================
export async function executeS3Upload(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as { files: { source: string; destKey: string }[]; bucket: string; endpoint: string; profile: string; prefix: string };
  const total = (config.files || []).length;

  for (let i = 0; i < total; i++) {
    const file = config.files[i];
    const destKey = file.destKey || `${config.prefix || ""}${file.source}`;
    const command = `aws s3 cp ${file.source} s3://${config.bucket}/${destKey} --endpoint-url ${config.endpoint} --profile ${config.profile}`;

    ctx.onLog(`[s3] (${i + 1}/${total}) ${file.source}`);

    const result = await runCommand({
      client: ctx.client, command, cwd: ctx.rootPath,
      logPrefix: "[s3]", timeout: 300000, signal: ctx.signal,
      onLog: ctx.onLog, flushLogs: ctx.flushLogs,
      pm2Name: `s3-${i}-${Date.now()}`,
      registerPm2: ctx.registerPm2, unregisterPm2: ctx.unregisterPm2,
      vpsHost: ctx.vpsHost, vpsAgentPort: ctx.vpsAgentPort, vpsApiKey: ctx.vpsApiKey,
    });

    if (!result.success) return { success: false, error: `S3 failed: ${file.source} — ${result.error}` };
    ctx.onLog(`[s3] ✓ ${file.source}`);
  }

  ctx.onLog(`[s3] ✓ ${total} fichiers uploadés`);
  await ctx.flushLogs();
  return { success: true };
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
