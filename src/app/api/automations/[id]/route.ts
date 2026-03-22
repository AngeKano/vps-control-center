import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET single automation
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const automation = await prisma.automation.findUnique({
      where: { id },
      include: {
        category: true,
        createdBy: { select: { name: true, email: true } },
        workflowVps: {
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
        },
        runs: {
          orderBy: { startedAt: "desc" },
          take: 10,
          include: {
            triggeredBy: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (!automation) {
      return NextResponse.json(
        { error: "Automatisation introuvable" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: automation });
  } catch (error) {
    console.error("Error fetching automation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch automation" },
      { status: 500 }
    );
  }
}

// UPDATE automation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();

    // Build update data dynamically
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.type !== undefined) updateData.type = body.type;
    if (body.description !== undefined) updateData.description = body.description?.trim() || null;
    if (body.source !== undefined) updateData.source = body.source?.trim() || null;
    if (body.releaseDate !== undefined) updateData.releaseDate = body.releaseDate ? new Date(body.releaseDate) : null;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.nodes !== undefined) updateData.nodes = body.nodes;
    if (body.edges !== undefined) updateData.edges = body.edges;
    if (body.globalVars !== undefined) updateData.globalVars = body.globalVars;

    const automation = await prisma.automation.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        createdBy: { select: { name: true, email: true } },
        workflowVps: {
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
        },
      },
    });

    return NextResponse.json({ success: true, data: automation });
  } catch (error) {
    console.error("Error updating automation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update automation" },
      { status: 500 }
    );
  }
}

// DELETE automation
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;

    await prisma.automation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting automation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete automation" },
      { status: 500 }
    );
  }
}
