import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// LIST automations
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");

    const where = categoryId ? { categoryId } : {};

    const automations = await prisma.automation.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        category: true,
        createdBy: { select: { name: true, email: true } },
        workflowVps: {
          include: {
            vps: {
              select: {
                id: true,
                name: true,
                host: true,
                port: true,
                agentPort: true,
                username: true,
              },
            },
          },
        },
        _count: { select: { runs: true } },
      },
    });

    return NextResponse.json({ success: true, data: automations });
  } catch (error) {
    console.error("Error fetching automations:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch automations" },
      { status: 500 }
    );
  }
}

// CREATE automation
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, type, description, source, releaseDate, categoryId, categoryName } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Le nom est requis" },
        { status: 400 }
      );
    }

    // Resolve or create category
    let resolvedCategoryId = categoryId;

    if (!resolvedCategoryId && categoryName) {
      const existing = await prisma.automationCategory.findUnique({
        where: { name: categoryName.trim() },
      });

      if (existing) {
        resolvedCategoryId = existing.id;
      } else {
        const newCat = await prisma.automationCategory.create({
          data: { name: categoryName.trim() },
        });
        resolvedCategoryId = newCat.id;
      }
    }

    if (!resolvedCategoryId) {
      return NextResponse.json(
        { error: "Une catégorie est requise" },
        { status: 400 }
      );
    }

    const automation = await prisma.automation.create({
      data: {
        name: name.trim(),
        type: type || "MENSUELLE",
        description: description?.trim() || null,
        source: source?.trim() || null,
        releaseDate: releaseDate ? new Date(releaseDate) : null,
        categoryId: resolvedCategoryId,
        userId: session.user.id,
        nodes: [],
        edges: [],
        globalVars: [],
      },
      include: {
        category: true,
        createdBy: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({ success: true, data: automation });
  } catch (error) {
    console.error("Error creating automation:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create automation" },
      { status: 500 }
    );
  }
}
