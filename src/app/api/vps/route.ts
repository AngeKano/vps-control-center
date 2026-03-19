import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VpsClient } from "@/lib/vps-client";

// CREATE VPS
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN")
    return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    const body = await request.json();
    const {
      name,
      host,
      port = 22,
      agentPort = 4000,
      username = "root",
      description,
    } = body;

    if (!name || !host) {
      return NextResponse.json(
        { error: "Name and host required" },
        { status: 400 }
      );
    }

    const vps = await prisma.vps.create({
      data: {
        name,
        host,
        port,
        agentPort,
        username,
        description,
        authType: "PASSWORD",
      },
    });

    return NextResponse.json({ success: true, data: vps });
  } catch (error) {
    console.error("Error creating VPS:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create VPS" },
      { status: 500 }
    );
  }
}

// LIST VPS
export async function GET() {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const vpsList = await prisma.vps.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    const apiKey = process.env.VPS_API_KEY || "";

    const vpsWithStatus = await Promise.all(
      vpsList.map(async (vps) => {
        const client = new VpsClient(vps.host, vps.agentPort, apiKey);
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

        return {
          id: vps.id,
          name: vps.name,
          host: vps.host,
          port: vps.port,
          agentPort: vps.agentPort,
          username: vps.username,
          description: vps.description,
          status,
          stats,
        };
      })
    );

    return NextResponse.json({ success: true, data: vpsWithStatus });
  } catch (error) {
    console.error("Error fetching VPS:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch VPS" },
      { status: 500 }
    );
  }
}
