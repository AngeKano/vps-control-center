import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VpsClient } from "@/lib/vps-client";

// READ .env from VPS
export async function GET(
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

    if (!workflowVps.envPath) {
      return NextResponse.json(
        { error: "Aucun chemin .env configuré" },
        { status: 400 }
      );
    }

    const apiKey = process.env.VPS_API_KEY || "";
    const client = new VpsClient(
      workflowVps.vps.host,
      workflowVps.vps.agentPort,
      apiKey
    );

    const result = await client.readFile(workflowVps.envPath);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to read .env" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { content: result.data?.content || "", path: workflowVps.envPath },
    });
  } catch (error) {
    console.error("Error reading .env:", error);
    return NextResponse.json(
      { success: false, error: "Failed to read .env" },
      { status: 500 }
    );
  }
}

// WRITE .env to VPS
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
    const { content } = body;

    if (content === undefined) {
      return NextResponse.json(
        { error: "Le contenu est requis" },
        { status: 400 }
      );
    }

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

    if (!workflowVps.envPath) {
      return NextResponse.json(
        { error: "Aucun chemin .env configuré" },
        { status: 400 }
      );
    }

    const apiKey = process.env.VPS_API_KEY || "";
    const client = new VpsClient(
      workflowVps.vps.host,
      workflowVps.vps.agentPort,
      apiKey
    );

    const result = await client.writeFile(workflowVps.envPath, content);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Failed to write .env" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error writing .env:", error);
    return NextResponse.json(
      { success: false, error: "Failed to write .env" },
      { status: 500 }
    );
  }
}
