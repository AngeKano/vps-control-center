import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAutomation } from "@/lib/automation-engine/engine";

// START a run
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { fromNodeId } = body; // optional: restart from this node

    const automation = await prisma.automation.findUnique({
      where: { id },
      include: {
        workflowVps: { include: { vps: true } },
      },
    });

    if (!automation) {
      return NextResponse.json(
        { error: "Automatisation introuvable" },
        { status: 404 }
      );
    }

    // Create run record
    const run = await prisma.automationRun.create({
      data: {
        automationId: id,
        status: "RUNNING",
        userId: session.user.id,
        nodeStates: {},
        nodeLogs: {},
      },
    });

    // Update automation status
    await prisma.automation.update({
      where: { id },
      data: { status: "RUNNING" },
    });

    // Fire and forget - the engine runs asynchronously
    runAutomation(automation, run.id, fromNodeId).catch((err) => {
      console.error("Automation engine error:", err);
    });

    return NextResponse.json({ success: true, data: run });
  } catch (error) {
    console.error("Error starting run:", error);
    return NextResponse.json(
      { success: false, error: "Failed to start run" },
      { status: 500 }
    );
  }
}

// LIST runs for an automation
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;

    const runs = await prisma.automationRun.findMany({
      where: { automationId: id },
      orderBy: { startedAt: "desc" },
      take: 20,
      include: {
        triggeredBy: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, data: runs });
  } catch (error) {
    console.error("Error fetching runs:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch runs" },
      { status: 500 }
    );
  }
}
