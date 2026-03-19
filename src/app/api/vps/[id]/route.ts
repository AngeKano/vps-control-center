import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VpsClient } from "@/lib/vps-client";

// GET single VPS
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const vps = await prisma.vps.findUnique({ where: { id } });
    if (!vps) return NextResponse.json({ error: "VPS not found" }, { status: 404 });

    // Check connection status
    const client = new VpsClient(vps.host, vps.agentPort, process.env.VPS_API_KEY || "");
    let status = "offline";
    let stats = null;

    try {
      const health = await client.health();
      if (health) {
        status = "online";
        const statsRes = await client.getSystemStats();
        if (statsRes.success && statsRes.data) stats = statsRes.data;
      }
    } catch {
      status = "offline";
    }

    return NextResponse.json({ success: true, data: { ...vps, status, stats } });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch VPS" }, { status: 500 });
  }
}

// UPDATE VPS
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await params;

  try {
    const body = await request.json();
    const { name, host, port, agentPort, username, description } = body;

    const vps = await prisma.vps.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(host && { host }),
        ...(port && { port }),
        ...(agentPort && { agentPort }),
        ...(username && { username }),
        ...(description !== undefined && { description }),
      },
    });

    return NextResponse.json({ success: true, data: vps });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ success: false, error: "Failed to update VPS" }, { status: 500 });
  }
}

// DELETE VPS (soft delete)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await params;

  try {
    await prisma.vps.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, message: "VPS deleted" });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete VPS" }, { status: 500 });
  }
}
