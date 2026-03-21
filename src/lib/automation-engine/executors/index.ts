import { VpsClient } from "@/lib/vps-client";
import type { AutomationNodeData } from "@/types/automation";

export interface ExecutorContext {
  client: VpsClient;
  rootPath: string;
  envPath: string | null;
  nodeData: AutomationNodeData;
  onLog: (line: string) => void;
  signal: AbortSignal;
}

export interface ExecutorResult {
  success: boolean;
  error?: string;
}

export type Executor = (ctx: ExecutorContext) => Promise<ExecutorResult>;

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

// ---- PM2 Script Executor ----
export async function executePm2Script(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as { pm2Name: string; npmCommand: string; scriptFile: string };

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

    ctx.onLog(`[pm2] Processus "${pm2Name}" démarré, en attente de fin...`);

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 7200; // 10h max (poll every 5s)

    while (attempts < maxAttempts) {
      if (ctx.signal.aborted) {
        ctx.onLog(`[pm2] Arrêt demandé, suppression du processus...`);
        await ctx.client.deleteProcess(pm2Name);
        return { success: false, error: "Exécution annulée" };
      }

      await sleep(5000);
      attempts++;

      // Check process status
      const statusResult = await ctx.client.getProcessStatus(pm2Name);
      if (statusResult.success && statusResult.data) {
        const status = statusResult.data.status;

        if (status === "stopped" || status === "errored") {
          // Get logs
          const logsResult = await ctx.client.getProcessLogs(pm2Name, 100);
          if (logsResult.success && logsResult.data) {
            for (const line of logsResult.data.logs) {
              ctx.onLog(`[pm2] ${line}`);
            }
          }

          // Clean up
          await ctx.client.deleteProcess(pm2Name);

          if (status === "errored") {
            return { success: false, error: `PM2 process "${pm2Name}" ended with error` };
          }

          ctx.onLog(`[pm2] Processus "${pm2Name}" terminé avec succès`);
          return { success: true };
        }
      } else {
        // Process not found = already finished
        ctx.onLog(`[pm2] Processus "${pm2Name}" terminé`);
        return { success: true };
      }

      // Log progress every 30s
      if (attempts % 6 === 0) {
        ctx.onLog(`[pm2] En cours... (${Math.floor((attempts * 5) / 60)}min)`);

        // Fetch recent logs
        const logsResult = await ctx.client.getProcessLogs(pm2Name, 5);
        if (logsResult.success && logsResult.data) {
          for (const line of logsResult.data.logs) {
            ctx.onLog(`[pm2] ${line}`);
          }
        }
      }
    }

    return { success: false, error: "Timeout: le processus PM2 a dépassé le temps maximum" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "PM2 executor error" };
  }
}

// ---- SSH Command Executor ----
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
      // Build docker exec command
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

    const result = await ctx.client.exec(command, ctx.rootPath, 600000); // 10min timeout

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
        return { success: false, error: `Exit code: ${result.data.exitCode}` };
      }

      ctx.onLog(`[ssh] Commande terminée avec succès`);
      return { success: true };
    }

    return { success: false, error: result.error || "SSH execution failed" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "SSH executor error" };
  }
}

// ---- SCP Transfer Executor ----
export async function executeScpTransfer(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as {
    sourceVpsId: string;
    sourcePath: string;
    destVpsId: string;
    destPath: string;
  };

  try {
    // SCP is executed as a shell command on the source VPS
    const command = `scp ${config.sourcePath} ${config.destPath}`;

    ctx.onLog(`[scp] Transfert: ${config.sourcePath} → ${config.destPath}`);

    const result = await ctx.client.exec(command, ctx.rootPath, 600000);

    if (result.success && result.data) {
      if (result.data.exitCode !== 0) {
        ctx.onLog(`[scp:err] ${result.data.stderr}`);
        return { success: false, error: `SCP failed: ${result.data.stderr}` };
      }
      ctx.onLog(`[scp] Transfert terminé`);
      return { success: true };
    }

    return { success: false, error: result.error || "SCP failed" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "SCP executor error" };
  }
}

// ---- DB Export Executor ----
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

    const result = await ctx.client.exec(command, ctx.rootPath, 600000);

    if (result.success && result.data) {
      if (result.data.exitCode !== 0) {
        ctx.onLog(`[db-export:err] ${result.data.stderr}`);
        return { success: false, error: `DB Export failed: ${result.data.stderr}` };
      }
      ctx.onLog(`[db-export] Export terminé`);
      return { success: true };
    }

    return { success: false, error: result.error || "DB Export failed" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "DB Export error" };
  }
}

// ---- DB Import Executor ----
export async function executeDbImport(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as {
    scriptPath: string;
    variables: { key: string; value: string }[];
  };

  try {
    // Build command with env vars inline
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

    const result = await ctx.client.exec(command, ctx.rootPath, 600000);

    if (result.success && result.data) {
      if (result.data.stdout) {
        const lines = result.data.stdout.split("\n").slice(-15);
        for (const line of lines) ctx.onLog(`[db-import] ${line}`);
      }
      if (result.data.exitCode !== 0) {
        ctx.onLog(`[db-import:err] ${result.data.stderr}`);
        return { success: false, error: `DB Import failed: exit code ${result.data.exitCode}` };
      }
      ctx.onLog(`[db-import] Import terminé`);
      return { success: true };
    }

    return { success: false, error: result.error || "DB Import failed" };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "DB Import error" };
  }
}

// ---- Tippecanoe Executor ----
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

      const command = `nohup tippecanoe ${flags} > output_${inputFile.replace(/\.geojson$/, "")}.log 2>&1`;

      ctx.onLog(`[tippecanoe] ${inputFile} → ${outputFile}`);

      const result = await ctx.client.exec(command, ctx.rootPath, 3600000); // 1h timeout

      if (result.success && result.data && result.data.exitCode === 0) {
        ctx.onLog(`[tippecanoe] ${inputFile} terminé`);
        results.push({ file: inputFile, success: true });
      } else {
        const error = result.data?.stderr || result.error || "Unknown error";
        ctx.onLog(`[tippecanoe:err] ${inputFile}: ${error}`);
        results.push({ file: inputFile, success: false, error });
      }
    }

    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      return { success: false, error: `Tippecanoe failed for: ${failed.map((f) => f.file).join(", ")}` };
    }

    ctx.onLog(`[tippecanoe] Toutes les tuiles générées`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Tippecanoe error" };
  }
}

// ---- S3/R2 Upload Executor ----
export async function executeS3Upload(ctx: ExecutorContext): Promise<ExecutorResult> {
  const config = ctx.nodeData.config as {
    files: { source: string; destKey: string }[];
    bucket: string;
    endpoint: string;
    profile: string;
    prefix: string;
  };

  try {
    for (const file of config.files || []) {
      const destKey = file.destKey || `${config.prefix || ""}${file.source}`;
      const command = `aws s3 cp ${file.source} s3://${config.bucket}/${destKey} --endpoint-url ${config.endpoint} --profile ${config.profile}`;

      ctx.onLog(`[s3] Upload: ${file.source} → s3://${config.bucket}/${destKey}`);

      const result = await ctx.client.exec(command, ctx.rootPath, 300000);

      if (!result.success || (result.data && result.data.exitCode !== 0)) {
        const error = result.data?.stderr || result.error || "Upload failed";
        ctx.onLog(`[s3:err] ${error}`);
        return { success: false, error: `S3 upload failed for ${file.source}: ${error}` };
      }

      ctx.onLog(`[s3] ${file.source} uploadé`);
    }

    ctx.onLog(`[s3] Tous les fichiers uploadés`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "S3 upload error" };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
