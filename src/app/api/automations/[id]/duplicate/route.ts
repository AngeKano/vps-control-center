import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DUPLICATE automation
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;

    const original = await prisma.automation.findUnique({
      where: { id },
      include: {
        workflowVps: true,
      },
    });

    if (!original) {
      return NextResponse.json(
        { error: "Automatisation introuvable" },
        { status: 404 }
      );
    }

    // Create the duplicate
    const duplicate = await prisma.automation.create({
      data: {
        name: `${original.name} (copie)`,
        type: original.type,
        description: original.description,
        source: original.source,
        releaseDate: original.releaseDate,
        status: "DRAFT",
        categoryId: original.categoryId,
        userId: session.user.id,
        nodes: original.nodes ?? [],
        edges: original.edges ?? [],
        globalVars: original.globalVars ?? [],
      },
      include: {
        category: true,
        createdBy: { select: { name: true, email: true } },
      },
    });

    // Duplicate VPS assignments
    if (original.workflowVps.length > 0) {
      await prisma.automationVps.createMany({
        data: original.workflowVps.map((wv) => ({
          automationId: duplicate.id,
          vpsId: wv.vpsId,
          label: wv.label,
          rootPath: wv.rootPath,
          envPath: wv.envPath,
        })),
      });
    }

    return NextResponse.json({ success: true, data: duplicate });
  } catch (error) {
    console.error("Error duplicating automation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to duplicate automation" },
      { status: 500 }
    );
  }
}
