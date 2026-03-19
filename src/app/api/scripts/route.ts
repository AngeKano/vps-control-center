import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VpsClient } from "@/lib/vps-client";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const scripts = await prisma.script.findMany({
      where: { isActive: true },
      include: { vps: true, project: true },
      orderBy: [{ project: { name: "asc" } }, { order: "asc" }],
    });

    const apiKey = process.env.VPS_API_KEY || "";

    const scriptsWithStatus = await Promise.all(
      scripts.map(async (script) => {
        let pm2Status = null;

        try {
          const client = new VpsClient(script.vps.host, script.vps.agentPort, apiKey);
          const health = await client.health();

          if (health) {
            const result = await client.listProcesses();
            if (result.success && result.data) {
              const process = result.data.find((p) => p.name === script.name || p.name.toLowerCase().includes(script.name.toLowerCase()));
              if (process) {
                pm2Status = { status: process.status, uptime: process.uptime, cpu: process.cpu, memory: process.memory, restarts: process.restarts, pm_id: process.pm_id };
              }
            }
          }
        } catch {}

        return {
          id: script.id, name: script.name, filename: script.filename, command: script.command, description: script.description, workingDir: script.workingDir, order: script.order,
          vps: { id: script.vps.id, name: script.vps.name, host: script.vps.host, agentPort: script.vps.agentPort },
          project: { id: script.project.id, name: script.project.name, slug: script.project.slug, color: script.project.color, workingDir: script.project.workingDir },
          pm2Status,
        };
      })
    );

    return NextResponse.json({ success: true, data: scriptsWithStatus });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch scripts" }, { status: 500 });
  }
}
