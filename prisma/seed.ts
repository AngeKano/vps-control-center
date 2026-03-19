import { PrismaClient, Role, AuthType, VpsRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...\n");

  // Users
  console.log("👤 Creating users...");
  const adminPassword = await bcrypt.hash("Admin2025!", 12);
  const operatorPassword = await bcrypt.hash("Operator2025!", 12);
  const viewerPassword = await bcrypt.hash("Viewer2025!", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@vpscontrol.local" },
    update: { password: adminPassword },
    create: {
      email: "admin@vpscontrol.local",
      password: adminPassword,
      name: "Administrateur",
      role: Role.ADMIN,
    },
  });

  const operator = await prisma.user.upsert({
    where: { email: "operator@vpscontrol.local" },
    update: { password: operatorPassword },
    create: {
      email: "operator@vpscontrol.local",
      password: operatorPassword,
      name: "Opérateur",
      role: Role.OPERATOR,
    },
  });

  const viewer = await prisma.user.upsert({
    where: { email: "viewer@vpscontrol.local" },
    update: { password: viewerPassword },
    create: {
      email: "viewer@vpscontrol.local",
      password: viewerPassword,
      name: "Lecteur",
      role: Role.VIEWER,
    },
  });

  console.log(`   ✅ Admin: ${admin.email}`);
  console.log(`   ✅ Operator: ${operator.email}`);
  console.log(`   ✅ Viewer: ${viewer.email}\n`);

  // VPS
  console.log("🖥️  Creating VPS...");
  const vps1 = await prisma.vps.upsert({
    where: { id: "vps-principal" },
    update: {},
    create: {
      id: "vps-principal",
      name: "VPS Principal",
      host: "145.223.33.245",
      port: 22,
      agentPort: 4000,
      username: "stph",
      authType: AuthType.PASSWORD,
      description: "Serveur principal de traitement",
    },
  });
  console.log(`   ✅ ${vps1.name}: ${vps1.host}:${vps1.agentPort}\n`);

  // Project
  console.log("📁 Creating projects...");
  const project = await prisma.project.upsert({
    where: { slug: "genealogie-parcelles" },
    update: {},
    create: {
      name: "Généalogie Parcelles",
      slug: "genealogie-parcelles",
      description: "Système de généalogie des parcelles cadastrales",
      color: "#10B981",
      workingDir: "/home/stph/genealogie_process/genealogie_process",
    },
  });
  console.log(`   ✅ ${project.name}\n`);

  // Link VPS to Project
  await prisma.projectVps.upsert({
    where: { projectId_vpsId: { projectId: project.id, vpsId: vps1.id } },
    update: {},
    create: {
      projectId: project.id,
      vpsId: vps1.id,
      role: VpsRole.PROCESSING,
      order: 1,
    },
  });

  // Scripts
  console.log("📜 Creating scripts...");
  const scripts = [
    {
      id: "script-download",
      name: "1-Téléchargement",
      filename: "download.js",
      command: "npm run download",
      order: 1,
    },
    {
      id: "script-unzip",
      name: "2-Décompression",
      filename: "unzip.js",
      command: "npm run unzip",
      order: 2,
    },
    {
      id: "script-process",
      name: "3-Traitement",
      filename: "process.js",
      command: "npm run process",
      order: 3,
    },
    {
      id: "script-import",
      name: "4-Import",
      filename: "import.js",
      command: "npm run import",
      order: 4,
    },
  ];

  for (const s of scripts) {
    await prisma.script.upsert({
      where: { id: s.id },
      update: {},
      create: { ...s, vpsId: vps1.id, projectId: project.id },
    });
    console.log(`   ✅ ${s.name}`);
  }

  // Saved Queries
  console.log("\n💾 Creating saved queries...");
  const queries = [
    {
      name: "Dernières parcelles",
      query: "SELECT * FROM parcelles ORDER BY date_import DESC LIMIT 10",
    },
    {
      name: "Stats par département",
      query:
        "SELECT departement, count() as total FROM parcelles GROUP BY departement ORDER BY total DESC",
    },
    {
      name: "Total parcelles",
      query: "SELECT count() as total FROM parcelles",
    },
  ];

  for (const q of queries) {
    await prisma.savedQuery.upsert({
      where: { id: `query-${q.name.toLowerCase().replace(/\s+/g, "-")}` },
      update: {},
      create: {
        id: `query-${q.name.toLowerCase().replace(/\s+/g, "-")}`,
        ...q,
        projectId: project.id,
        isDefault: true,
      },
    });
    console.log(`   ✅ ${q.name}`);
  }

  // Settings
  await prisma.setting.upsert({
    where: { key: "clickhouse" },
    update: {},
    create: {
      key: "clickhouse",
      value: { host: "localhost", port: 8123, database: "default" },
    },
  });

  console.log("\n" + "═".repeat(50));
  console.log("🎉 Database seeded successfully!\n");
  console.log("🔐 Login credentials:");
  console.log("   Admin:    admin@vpscontrol.local / Admin2025!");
  console.log("   Operator: operator@vpscontrol.local / Operator2025!");
  console.log("   Viewer:   viewer@vpscontrol.local / Viewer2025!");
  console.log("═".repeat(50));
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
