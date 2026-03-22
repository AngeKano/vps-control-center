import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VpsClient } from "@/lib/vps-client";

// LIST workflow VPS for an automation
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const workflowVps = await prisma.automationVps.findMany({
      where: { automationId: id },
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
    console.error("Error fetching workflow VPS:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch workflow VPS" },
      { status: 500 }
    );
  }
}

// ADD VPS to workflow
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const { vpsId, label, rootPath, envPath } = body;

    if (!vpsId || !label || !rootPath) {
      return NextResponse.json(
        { error: "vpsId, label et rootPath sont requis" },
        { status: 400 }
      );
    }

    // Verify automation exists
    const automation = await prisma.automation.findUnique({ where: { id } });
    if (!automation) {
      return NextResponse.json(
        { error: "Automatisation introuvable" },
        { status: 404 }
      );
    }

    // Create workflow VPS
    const workflowVps = await prisma.automationVps.create({
      data: {
        automationId: id,
        vpsId,
        label: label.trim(),
        rootPath: rootPath.trim(),
        envPath: envPath?.trim() || null,
      },
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
    console.error("Error adding workflow VPS:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add VPS to workflow" },
      { status: 500 }
    );
  }
}
