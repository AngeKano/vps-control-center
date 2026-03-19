import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const projects = await prisma.project.findMany({
      where: { isActive: true },
      include: {
        scripts: { where: { isActive: true }, include: { vps: { select: { id: true, name: true } } }, orderBy: { order: "asc" } },
        vps: { include: { vps: { select: { id: true, name: true, host: true } } }, orderBy: { order: "asc" } },
        queries: { orderBy: { name: "asc" } },
        _count: { select: { scripts: true, queries: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch projects" }, { status: 500 });
  }
}
