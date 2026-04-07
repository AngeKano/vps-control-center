import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VpsClient } from "@/lib/vps-client";
import { readExitCode } from "@/lib/automation-engine/executors";

// POST /api/automations/{id}/run/{runId}/recover
// Checks actual PM2 process status on VPS for stale RUNNING nodes
// and updates their state accordingly.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, runId } = await params;

    const run = await prisma.automationRun.findUnique({
      where: { id: runId },
    });

    if (!run || run.status !== "RUNNING") {
      return NextResponse.json({
        success: true,
        data: run,
        recovered: false,
        message: "Run is not in RUNNING state",
      });
    }

    const automation = await prisma.automation.findUnique({
      where: { id },
      include: { workflowVps: { include: { vps: true } } },
    });

    if (!automation) {
      return NextResponse.json(
        { error: "Automatisation introuvable" },
        { status: 404 }
      );
    }

    const apiKey = process.env.VPS_API_KEY || "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeStates = (run.nodeStates || {}) as Record<string, any>;
    const nodes = (automation.nodes || []) as Array<{
      id: string;
      data: { vpsId: string; nodeType: string };
    }>;

    // Find nodes still marked as RUNNING
    const runningNodeIds = Object.entries(nodeStates)
      .filter(([, state]) => state.status === "RUNNING")
      .map(([nodeId]) => nodeId);

    if (runningNodeIds.length === 0) {
      // No running nodes but run is RUNNING — mark as COMPLETED
      await prisma.automationRun.update({
        where: { id: runId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { status: "COMPLETED", finishedAt: new Date(), nodeStates: nodeStates as any },
      });
      await prisma.automation.update({
        where: { id },
        data: { status: "COMPLETED" },
      });
      const updatedRun = await prisma.automationRun.findUnique({ where: { id: runId } });
      return NextResponse.json({ success: true, data: updatedRun, recovered: true });
    }

    // Check each running node's actual PM2 status on VPS
    let anyStillRunning = false;
    let anyFailed = false;

    for (const nodeId of runningNodeIds) {
      const state = nodeStates[nodeId];
      const pm2Name = state?.activePm2Name as string | undefined;
      const node = nodes.find((n) => n.id === nodeId);

      if (!node || !pm2Name) {
        // No PM2 name stored — can't check, mark as FAILED
        nodeStates[nodeId] = {
          ...state,
          status: "FAILED",
          error: "Recovery: aucun process PM2 associé",
          finishedAt: new Date().toISOString(),
        };
        anyFailed = true;
        continue;
      }

      // Find VPS client
      const wv = automation.workflowVps.find((w) => w.id === node.data.vpsId);
      if (!wv) {
        nodeStates[nodeId] = {
          ...state,
          status: "FAILED",
          error: "Recovery: VPS introuvable",
          finishedAt: new Date().toISOString(),
        };
        anyFailed = true;
        continue;
      }

      const client = new VpsClient(wv.vps.host, wv.vps.agentPort, apiKey);

      // Check PM2 process status
      const statusResult = await client.getProcessStatus(pm2Name);

      if (!statusResult.success) {
        // Can't reach VPS — leave as RUNNING
        anyStillRunning = true;
        continue;
      }

      if (!statusResult.data) {
        // Process gone from PM2 — check exit code
        const exitCodeFile = `/tmp/.pm2-exit-${pm2Name}`;
        const exitCode = await readExitCode(client, exitCodeFile);

        if (exitCode !== null && exitCode !== 0) {
          nodeStates[nodeId] = {
            ...state,
            status: "FAILED",
            error: `Recovery: exit code ${exitCode}`,
            finishedAt: new Date().toISOString(),
          };
          delete nodeStates[nodeId].activePm2Name;
          anyFailed = true;
        } else {
          // exit code 0 or unknown (process finished cleanly)
          nodeStates[nodeId] = {
            ...state,
            status: "COMPLETED",
            finishedAt: new Date().toISOString(),
          };
          delete nodeStates[nodeId].activePm2Name;
        }
        continue;
      }

      const pm2Status = statusResult.data.status;

      if (pm2Status === "online") {
        // Still running on VPS
        anyStillRunning = true;
        continue;
      }

      if (pm2Status === "stopped") {
        // Finished — check exit code
        const exitCodeFile = `/tmp/.pm2-exit-${pm2Name}`;
        const exitCode = await readExitCode(client, exitCodeFile);
        try { await client.deleteProcess(pm2Name); } catch { /* ignore */ }

        if (exitCode !== null && exitCode !== 0) {
          nodeStates[nodeId] = {
            ...state,
            status: "FAILED",
            error: `Recovery: exit code ${exitCode}`,
            finishedAt: new Date().toISOString(),
          };
          anyFailed = true;
        } else {
          nodeStates[nodeId] = {
            ...state,
            status: "COMPLETED",
            finishedAt: new Date().toISOString(),
          };
        }
        delete nodeStates[nodeId].activePm2Name;
        continue;
      }

      if (pm2Status === "errored") {
        try { await client.deleteProcess(pm2Name); } catch { /* ignore */ }
        nodeStates[nodeId] = {
          ...state,
          status: "FAILED",
          error: "Recovery: PM2 errored",
          finishedAt: new Date().toISOString(),
        };
        delete nodeStates[nodeId].activePm2Name;
        anyFailed = true;
        continue;
      }

      // Unknown status — leave as-is
      anyStillRunning = true;
    }

    // Determine final run status
    const finalStatus = anyStillRunning ? "RUNNING" : anyFailed ? "FAILED" : "COMPLETED";
    const finishedAt = anyStillRunning ? undefined : new Date();

    await prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: finalStatus,
        ...(finishedAt ? { finishedAt } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        nodeStates: nodeStates as any,
      },
    });

    if (!anyStillRunning) {
      await prisma.automation.update({
        where: { id },
        data: { status: finalStatus },
      });
    }

    const updatedRun = await prisma.automationRun.findUnique({
      where: { id: runId },
      include: { triggeredBy: { select: { name: true, email: true } } },
    });

    return NextResponse.json({ success: true, data: updatedRun, recovered: true });
  } catch (error) {
    console.error("Error recovering run:", error);
    return NextResponse.json(
      { success: false, error: "Failed to recover run" },
      { status: 500 }
    );
  }
}
