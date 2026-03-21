import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VpsClient } from "@/lib/vps-client";

// VERIFY rootPath and envPath exist on the VPS
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; vpsId: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { vpsId } = await params;

    const workflowVps = await prisma.automationVps.findUnique({
      where: { id: vpsId },
      include: { vps: true },
    });

    if (!workflowVps) {
      return NextResponse.json(
        { error: "Workflow VPS introuvable" },
        { status: 404 }
      );
    }

    const apiKey = process.env.VPS_API_KEY || "";
    const client = new VpsClient(
      workflowVps.vps.host,
      workflowVps.vps.agentPort,
      apiKey
    );

    const results: {
      rootPath: { exists: boolean; isDirectory: boolean; isEmpty?: boolean } | null;
      envPath: { exists: boolean } | null;
      online: boolean;
    } = {
      rootPath: null,
      envPath: null,
      online: false,
    };

    // Check VPS is online
    const health = await client.health();
    if (!health) {
      return NextResponse.json({
        success: true,
        data: { ...results, online: false },
      });
    }
    results.online = true;

    // Check rootPath
    const rootCheck = await client.pathExists(workflowVps.rootPath);
    if (rootCheck.success && rootCheck.data) {
      results.rootPath = rootCheck.data;
    }

    // Check envPath if specified
    if (workflowVps.envPath) {
      const envCheck = await client.pathExists(workflowVps.envPath);
      if (envCheck.success && envCheck.data) {
        results.envPath = { exists: envCheck.data.exists };
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error("Error verifying VPS paths:", error);
    return NextResponse.json(
      { success: false, error: "Failed to verify VPS paths" },
      { status: 500 }
    );
  }
}
