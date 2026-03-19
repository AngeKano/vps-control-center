import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VpsClient } from "@/lib/vps-client";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const vps = await prisma.vps.findUnique({ where: { id } });
    if (!vps) return NextResponse.json({ error: "VPS not found" }, { status: 404 });

    const client = new VpsClient(vps.host, vps.agentPort, process.env.VPS_API_KEY || "");
    const result = await client.getSystemStats();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch stats" }, { status: 500 });
  }
}
