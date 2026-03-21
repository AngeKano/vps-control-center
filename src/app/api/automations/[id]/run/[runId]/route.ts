import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stopAutomationRun } from "@/lib/automation-engine/engine";

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

// STOP a run
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id, runId } = await params;

    // Signal the engine to stop
    stopAutomationRun(runId);

    // Update DB
    await prisma.automationRun.update({
      where: { id: runId },
      data: { status: "FAILED", finishedAt: new Date() },
    });

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
