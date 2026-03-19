import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Server,
  FileCode,
  Activity,
  FolderKanban,
  Database,
  ArrowLeftRight,
} from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();

  const [vpsCount, projectCount, scriptCount, queryCount] = await Promise.all([
    prisma.vps.count({ where: { isActive: true } }),
    prisma.project.count({ where: { isActive: true } }),
    prisma.script.count({ where: { isActive: true } }),
    prisma.savedQuery.count(),
  ]);

  const stats = [
    {
      title: "VPS",
      value: vpsCount,
      description: "Serveurs configurés",
      icon: Server,
      href: "/dashboard/vps",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Projets",
      value: projectCount,
      description: "Projets actifs",
      icon: FolderKanban,
      href: "/dashboard/projects",
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Scripts",
      value: scriptCount,
      description: "Scripts configurés",
      icon: FileCode,
      href: "/dashboard/scripts",
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Requêtes",
      value: queryCount,
      description: "Requêtes sauvegardées",
      icon: Database,
      href: "/dashboard/database",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Bienvenue, {session?.user?.name || "Utilisateur"}
        </h1>
        <p className="text-muted-foreground">
          Voici un aperçu de vos VPS et scripts
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.title} href={stat.href}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Actions rapides
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/dashboard/vps"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
            >
              <Server className="h-5 w-5 text-blue-500" />
              <div>
                <p className="font-medium">Gérer les VPS</p>
                <p className="text-sm text-muted-foreground">
                  Voir l&apos;état de tous vos serveurs
                </p>
              </div>
            </Link>
            <Link
              href="/dashboard/scripts"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
            >
              <FileCode className="h-5 w-5 text-purple-500" />
              <div>
                <p className="font-medium">Contrôler les scripts</p>
                <p className="text-sm text-muted-foreground">
                  Démarrer, arrêter ou redémarrer
                </p>
              </div>
            </Link>
            <Link
              href="/dashboard/monitoring"
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
            >
              <Activity className="h-5 w-5 text-green-500" />
              <div>
                <p className="font-medium">Monitoring</p>
                <p className="text-sm text-muted-foreground">
                  CPU, RAM, Disque en temps réel
                </p>
              </div>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5" />
              Informations système
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
              <span className="text-sm text-muted-foreground">
                Rôle utilisateur
              </span>
              <span className="font-medium">
                {session?.user?.role || "N/A"}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
              <span className="text-sm text-muted-foreground">
                VPS configurés
              </span>
              <span className="font-medium">{vpsCount}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
              <span className="text-sm text-muted-foreground">
                Scripts actifs
              </span>
              <span className="font-medium">{scriptCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
