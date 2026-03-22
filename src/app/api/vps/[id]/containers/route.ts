import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VpsClient } from "@/lib/vps-client";

// LIST Docker containers on a VPS
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;

    const vps = await prisma.vps.findUnique({ where: { id } });
    if (!vps) {
      return NextResponse.json({ error: "VPS introuvable" }, { status: 404 });
    }

    const apiKey = process.env.VPS_API_KEY || "";
    const client = new VpsClient(vps.host, vps.agentPort, apiKey);

    const result = await client.listContainers();

    if (!result.success) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    return NextResponse.json({ success: true, data: result.data || [] });
  } catch (error) {
    console.error("Error listing containers:", error);
    return NextResponse.json(
      { success: false, error: "Failed to list containers" },
      { status: 500 }
    );
  }
}
