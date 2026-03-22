import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VpsClient } from "@/lib/vps-client";

// UPDATE workflow VPS
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; vpsId: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { vpsId } = await params;
    const body = await request.json();
    const updateData: Record<string, string | null> = {};

    if (body.label !== undefined) updateData.label = body.label.trim();
    if (body.rootPath !== undefined) updateData.rootPath = body.rootPath.trim();
    if (body.envPath !== undefined) updateData.envPath = body.envPath?.trim() || null;

    const workflowVps = await prisma.automationVps.update({
      where: { id: vpsId },
      data: updateData,
      include: {
        vps: {
          select: {
            id: true,
            name: true,
            host: true,
            port: true,
            agentPort: true,
            username: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: workflowVps });
  } catch (error) {
    console.error("Error updating workflow VPS:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update workflow VPS" },
      { status: 500 }
    );
  }
}

// DELETE workflow VPS
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; vpsId: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { vpsId } = await params;
    await prisma.automationVps.delete({ where: { id: vpsId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting workflow VPS:", error);
    return NextResponse.json(
      { success: false, error: "Failed to remove VPS from workflow" },
      { status: 500 }
    );
  }
}
