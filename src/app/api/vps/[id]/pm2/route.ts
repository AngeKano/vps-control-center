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
    const result = await client.listProcesses();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch processes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role === "VIEWER") return NextResponse.json({ error: "Permission denied" }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const { action, processName, script, cwd, name } = body;

  try {
    const vps = await prisma.vps.findUnique({ where: { id } });
    if (!vps) return NextResponse.json({ error: "VPS not found" }, { status: 404 });

    const client = new VpsClient(vps.host, vps.agentPort, process.env.VPS_API_KEY || "");
    let result;

    switch (action) {
      case "start": result = await client.startProcess(script, { name, cwd }); break;
      case "stop": result = await client.stopProcess(processName); break;
      case "restart": result = await client.restartProcess(processName); break;
      case "delete": result = await client.deleteProcess(processName); break;
      case "run-script": result = await client.runNpmScript(cwd, script, name); break;
      default: return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ success: false, error: "Failed to control process" }, { status: 500 });
  }
}
