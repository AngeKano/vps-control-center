import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stopAutomationRun } from "@/lib/automation-engine/engine";
import { VpsClient } from "@/lib/vps-client";

// GET run status + node states + logs
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { runId } = await params;

    const run = await prisma.automationRun.findUnique({
      where: { id: runId },
      include: {
        triggeredBy: { select: { name: true, email: true } },
      },
    });

    if (!run) {
      return NextResponse.json(
        { error: "Run introuvable" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: run });
  } catch (error) {
    console.error("Error fetching run:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch run" },
      { status: 500 }
    );
  }
}

// STOP a run — kills PM2 processes on VPS then updates DB
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, runId } = await params;

    // 1. Signal the in-memory engine to abort (may be empty if hot-reloaded)
    await stopAutomationRun(runId);

    // 2. Read from DB: find RUNNING nodes and kill their PM2 processes
    const run = await prisma.automationRun.findUnique({
      where: { id: runId },
    });

    const automation = await prisma.automation.findUnique({
      where: { id },
      include: {
        workflowVps: { include: { vps: true } },
      },
    });

    if (run && automation) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nodeStates = (run.nodeStates || {}) as Record<string, any>;
      const nodes = (automation.nodes || []) as Array<{
        id: string;
        data: {
          nodeType: string;
          vpsId: string;
          config: { pm2Name?: string };
        };
      }>;

      const apiKey = process.env.VPS_API_KEY || "";

      // Find all nodes currently RUNNING
      const runningNodeIds = Object.entries(nodeStates)
        .filter(([, state]) => state.status === "RUNNING")
        .map(([nodeId]) => nodeId);

      // For each running node, kill ALL active PM2 processes
      // This handles pm2_script (config.pm2Name) AND temporary PM2 (scp, ssh, db-export...)
      const killPromises = runningNodeIds.map(async (nodeId) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return;

        const vpsId = node.data.vpsId;
        const wv = automation.workflowVps.find((w) => w.id === vpsId);
        if (!wv) return;

        const client = new VpsClient(wv.vps.host, wv.vps.agentPort, apiKey);
        const state = nodeStates[nodeId];

        // Collect all PM2 names to kill for this node
        const pm2NamesToKill: string[] = [];

        // 1. activePm2Name from nodeStates (set by registerPm2 — works for ALL node types)
        if (state?.activePm2Name) {
          pm2NamesToKill.push(state.activePm2Name);
        }

        // 2. pm2_script config name (fallback if activePm2Name wasn't persisted yet)
        if (node.data.nodeType === "pm2_script" && node.data.config?.pm2Name) {
          if (!pm2NamesToKill.includes(node.data.config.pm2Name)) {
            pm2NamesToKill.push(node.data.config.pm2Name);
          }
        }

        // 3. For SCP nodes, also check the source VPS
        if (node.data.nodeType === "scp_transfer") {
          const scpConfig = node.data.config as { sourceVpsId?: string };
          if (scpConfig.sourceVpsId && scpConfig.sourceVpsId !== vpsId) {
            const sourceWv = automation.workflowVps.find((w) => w.id === scpConfig.sourceVpsId);
            if (sourceWv && state?.activePm2Name) {
              const sourceClient = new VpsClient(sourceWv.vps.host, sourceWv.vps.agentPort, apiKey);
              try {
                console.log(`[stop] Killing SCP PM2 "${state.activePm2Name}" on source VPS ${sourceWv.vps.host}`);
                await sourceClient.deleteProcess(state.activePm2Name);
              } catch (err) {
                console.error(`[stop] Failed:`, err);
              }
            }
          }
        }

        // Kill all PM2 processes for this node
        for (const pm2Name of pm2NamesToKill) {
          console.log(`[stop] Killing PM2 "${pm2Name}" on ${wv.vps.host}`);
          try {
            await client.deleteProcess(pm2Name);
            console.log(`[stop] PM2 "${pm2Name}" killed`);
          } catch (err) {
            console.error(`[stop] Failed to kill PM2 "${pm2Name}":`, err);
          }
        }
      });

      await Promise.allSettled(killPromises);

      // Update node states: mark all RUNNING as FAILED
      const updatedNodeStates = { ...nodeStates };
      for (const nodeId of runningNodeIds) {
        updatedNodeStates[nodeId] = {
          ...updatedNodeStates[nodeId],
          status: "FAILED",
          error: "Arrêté manuellement",
          finishedAt: new Date().toISOString(),
        } as Record<string, unknown>;
      }

      // 3. Update DB
      await prisma.automationRun.update({
        where: { id: runId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { status: "FAILED", finishedAt: new Date(), nodeStates: updatedNodeStates as any },
      });
    } else {
      // Fallback: just update status
      await prisma.automationRun.update({
        where: { id: runId },
        data: { status: "FAILED", finishedAt: new Date() },
      });
    }

    await prisma.automation.update({
      where: { id },
      data: { status: "FAILED" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error stopping run:", error);
    return NextResponse.json(
      { success: false, error: "Failed to stop run" },
      { status: 500 }
    );
  }
}
