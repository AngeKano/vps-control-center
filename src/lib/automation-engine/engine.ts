import { prisma } from "@/lib/prisma";
import { VpsClient } from "@/lib/vps-client";
import { getExecutionLayers, getDownstreamNodes, getParents } from "./dag";
import { resolveVarsDeep } from "./env-resolver";
import {
  executePm2Script,
  executeSshCommand,
  executeScpTransfer,
  executeDbExport,
  executeDbImport,
  executeTippecanoe,
  executeS3Upload,
  type ExecutorContext,
  type Executor,
} from "./executors";
import type { AutomationNodeData, NodeType, GlobalVar } from "@/types/automation";

// Track active runs so we can stop them
const activeRuns = new Map<string, AbortController>();

export function stopAutomationRun(runId: string) {
  const controller = activeRuns.get(runId);
  if (controller) {
    controller.abort();
    activeRuns.delete(runId);
  }
}

// Map node types to executors
const EXECUTORS: Record<NodeType, Executor> = {
  pm2_script: executePm2Script,
  ssh_command: executeSshCommand,
  scp_transfer: executeScpTransfer,
  db_export: executeDbExport,
  db_import: executeDbImport,
  tippecanoe: executeTippecanoe,
  s3_upload: executeS3Upload,
};

interface AutomationWithVps {
  id: string;
  nodes: unknown;
  edges: unknown;
  globalVars: unknown;
  workflowVps: Array<{
    id: string;
    vpsId: string;
    label: string;
    rootPath: string;
    envPath: string | null;
    vps: {
      id: string;
      name: string;
      host: string;
      port: number;
      agentPort: number;
      username: string;
    };
  }>;
}

interface FlowNode {
  id: string;
  data: AutomationNodeData;
}

interface FlowEdge {
  source: string;
  target: string;
}

/**
 * Main entry point: run an automation
 * @param automation - The automation object with workflowVps
 * @param runId - The AutomationRun ID
 * @param fromNodeId - Optional: restart from this specific node (skip completed nodes before it)
 */
export async function runAutomation(
  automation: AutomationWithVps,
  runId: string,
  fromNodeId?: string
): Promise<void> {
  const abortController = new AbortController();
  activeRuns.set(runId, abortController);

  const nodes = (automation.nodes || []) as FlowNode[];
  const edges = (automation.edges || []) as FlowEdge[];
  const globalVars = (automation.globalVars || []) as GlobalVar[];

  // Resolve global variables in all node data
  const resolvedNodes = nodes.map((n) => ({
    ...n,
    data: resolveVarsDeep(n.data, globalVars),
  }));

  // Build VPS client map: workflowVps.id → VpsClient
  const apiKey = process.env.VPS_API_KEY || "";
  const vpsClients = new Map<string, { client: VpsClient; rootPath: string; envPath: string | null }>();

  for (const wv of automation.workflowVps) {
    vpsClients.set(wv.id, {
      client: new VpsClient(wv.vps.host, wv.vps.agentPort, apiKey),
      rootPath: wv.rootPath,
      envPath: wv.envPath,
    });
  }

  // Get execution layers (parallel groups)
  const layers = getExecutionLayers(
    resolvedNodes.map((n) => ({ id: n.id })),
    edges
  );

  // If restarting from a specific node, determine which nodes to skip
  const skipNodes = new Set<string>();
  if (fromNodeId) {
    const downstreamNodes = new Set([fromNodeId, ...getDownstreamNodes(fromNodeId, edges)]);
    for (const node of resolvedNodes) {
      if (!downstreamNodes.has(node.id)) {
        skipNodes.add(node.id);
      }
    }
  }

  // Initialize node states
  const nodeStates: Record<string, { status: string; startedAt?: string; finishedAt?: string; error?: string }> = {};
  const nodeLogs: Record<string, string[]> = {};

  for (const node of resolvedNodes) {
    if (skipNodes.has(node.id)) {
      nodeStates[node.id] = { status: "COMPLETED", finishedAt: new Date().toISOString() };
      nodeLogs[node.id] = ["[skip] Noeud ignoré (déjà complété)"];
    } else {
      nodeStates[node.id] = { status: "DRAFT" };
      nodeLogs[node.id] = [];
    }
  }

  // Save initial state
  await updateRunState(runId, nodeStates, nodeLogs);

  try {
    // Execute layer by layer
    for (const layer of layers) {
      if (abortController.signal.aborted) break;

      // Filter out skipped nodes
      const toExecute = layer.filter((nodeId) => !skipNodes.has(nodeId));
      if (toExecute.length === 0) continue;

      // Check all parents are completed
      for (const nodeId of toExecute) {
        const parents = getParents(nodeId, edges);
        const allParentsDone = parents.every(
          (pid) => nodeStates[pid]?.status === "COMPLETED"
        );
        if (!allParentsDone) {
          nodeStates[nodeId] = {
            status: "FAILED",
            error: "Parent node(s) not completed",
            finishedAt: new Date().toISOString(),
          };
          nodeLogs[nodeId].push("[error] Un noeud parent n'est pas terminé");
          continue;
        }
      }

      // Execute all nodes in this layer in parallel
      const promises = toExecute.map(async (nodeId) => {
        if (nodeStates[nodeId]?.status === "FAILED") return; // already failed above

        const node = resolvedNodes.find((n) => n.id === nodeId);
        if (!node) return;

        const nodeType = node.data.nodeType;
        const executor = EXECUTORS[nodeType];

        if (!executor) {
          nodeStates[nodeId] = {
            status: "FAILED",
            error: `Type de noeud inconnu: ${nodeType}`,
            finishedAt: new Date().toISOString(),
          };
          return;
        }

        // Get VPS client
        const vpsInfo = node.data.vpsId ? vpsClients.get(node.data.vpsId) : null;
        if (!vpsInfo) {
          nodeStates[nodeId] = {
            status: "FAILED",
            error: "Aucun VPS configuré pour ce noeud",
            finishedAt: new Date().toISOString(),
          };
          nodeLogs[nodeId].push("[error] Aucun VPS associé");
          await updateRunState(runId, nodeStates, nodeLogs);
          return;
        }

        // Mark as running
        nodeStates[nodeId] = { status: "RUNNING", startedAt: new Date().toISOString() };
        nodeLogs[nodeId].push(`[start] Démarrage: ${node.data.label}`);
        await updateRunState(runId, nodeStates, nodeLogs);

        // Execute
        const ctx: ExecutorContext = {
          client: vpsInfo.client,
          rootPath: vpsInfo.rootPath,
          envPath: vpsInfo.envPath,
          nodeData: node.data,
          onLog: (line: string) => {
            nodeLogs[nodeId].push(line);
            // Throttled DB update (don't save every log line)
          },
          signal: abortController.signal,
        };

        try {
          const result = await executor(ctx);

          if (result.success) {
            nodeStates[nodeId] = {
              status: "COMPLETED",
              startedAt: nodeStates[nodeId].startedAt,
              finishedAt: new Date().toISOString(),
            };
            nodeLogs[nodeId].push(`[done] Terminé avec succès`);
          } else {
            nodeStates[nodeId] = {
              status: "FAILED",
              startedAt: nodeStates[nodeId].startedAt,
              finishedAt: new Date().toISOString(),
              error: result.error,
            };
            nodeLogs[nodeId].push(`[error] ${result.error}`);
          }
        } catch (err) {
          nodeStates[nodeId] = {
            status: "FAILED",
            startedAt: nodeStates[nodeId].startedAt,
            finishedAt: new Date().toISOString(),
            error: err instanceof Error ? err.message : "Erreur inconnue",
          };
          nodeLogs[nodeId].push(`[error] ${err instanceof Error ? err.message : "Erreur inconnue"}`);
        }

        await updateRunState(runId, nodeStates, nodeLogs);
      });

      await Promise.all(promises);

      // Check if any node in this layer failed
      const anyFailed = toExecute.some((nodeId) => nodeStates[nodeId]?.status === "FAILED");
      if (anyFailed) {
        // Mark all downstream nodes as failed/pending
        for (const nodeId of toExecute) {
          if (nodeStates[nodeId]?.status === "FAILED") {
            const downstream = getDownstreamNodes(nodeId, edges);
            for (const dId of downstream) {
              if (!skipNodes.has(dId) && nodeStates[dId]?.status !== "COMPLETED") {
                nodeStates[dId] = {
                  status: "DRAFT",
                  error: "Noeud parent échoué",
                };
                nodeLogs[dId].push("[skip] Non exécuté: un noeud parent a échoué");
              }
            }
          }
        }
        break; // Stop execution
      }
    }

    // Determine final status
    const allCompleted = resolvedNodes.every(
      (n) => nodeStates[n.id]?.status === "COMPLETED"
    );
    const anyFailed = resolvedNodes.some(
      (n) => nodeStates[n.id]?.status === "FAILED"
    );

    const finalStatus = abortController.signal.aborted
      ? "FAILED"
      : allCompleted
        ? "COMPLETED"
        : anyFailed
          ? "FAILED"
          : "DRAFT";

    // Update run and automation
    await prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: finalStatus,
        finishedAt: new Date(),
        nodeStates,
        nodeLogs,
      },
    });

    await prisma.automation.update({
      where: { id: automation.id },
      data: { status: finalStatus },
    });
  } catch (error) {
    console.error("Engine fatal error:", error);

    await prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        nodeStates,
        nodeLogs,
      },
    });

    await prisma.automation.update({
      where: { id: automation.id },
      data: { status: "FAILED" },
    });
  } finally {
    activeRuns.delete(runId);
  }
}

async function updateRunState(
  runId: string,
  nodeStates: Record<string, unknown>,
  nodeLogs: Record<string, string[]>
): Promise<void> {
  try {
    await prisma.automationRun.update({
      where: { id: runId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { nodeStates: nodeStates as any, nodeLogs: nodeLogs as any },
    });
  } catch (error) {
    console.error("Failed to update run state:", error);
  }
}
