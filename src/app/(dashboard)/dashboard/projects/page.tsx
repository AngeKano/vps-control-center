"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderKanban, Server, FileCode, Database } from "lucide-react";

interface Project {
  id: string; name: string; slug: string; description: string | null; color: string; workingDir: string | null;
  scripts: { id: string; name: string; vps: { name: string } }[];
  vps: { vps: { id: string; name: string }; role: string }[];
  _count: { scripts: number; queries: number };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetch("/api/projects").then((res) => res.json()).then((data) => { if (data.success) setProjects(data.data); }).finally(() => setLoading(false)); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Projets</h1><p className="text-muted-foreground">{projects.length} projet(s) configuré(s)</p></div>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{[1, 2].map((i) => <div key={i} className="h-64 rounded-xl border bg-card animate-pulse" />)}</div>
      ) : projects.length === 0 ? (
        <div className="text-center py-16"><FolderKanban className="h-16 w-16 text-muted-foreground mx-auto mb-4" /><h2 className="text-xl font-semibold mb-2">Aucun projet</h2></div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="overflow-hidden">
              <div className="h-2" style={{ backgroundColor: project.color }} />
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2"><FolderKanban className="h-5 w-5" />{project.name}</CardTitle>
                {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-muted"><div className="text-lg font-bold">{project._count.scripts}</div><div className="text-xs text-muted-foreground">Scripts</div></div>
                  <div className="p-2 rounded-lg bg-muted"><div className="text-lg font-bold">{project.vps.length}</div><div className="text-xs text-muted-foreground">VPS</div></div>
                  <div className="p-2 rounded-lg bg-muted"><div className="text-lg font-bold">{project._count.queries}</div><div className="text-xs text-muted-foreground">Requêtes</div></div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">VPS associés</p>
                  <div className="flex flex-wrap gap-1">{project.vps.map(({ vps }) => <Badge key={vps.id} variant="outline" className="text-xs"><Server className="h-3 w-3 mr-1" />{vps.name}</Badge>)}</div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Scripts</p>
                  <div className="space-y-1">
                    {project.scripts.slice(0, 3).map((script) => <div key={script.id} className="flex items-center gap-2 text-sm"><FileCode className="h-3 w-3 text-muted-foreground" /><span className="truncate">{script.name}</span></div>)}
                    {project.scripts.length > 3 && <p className="text-xs text-muted-foreground">+{project.scripts.length - 3} autres</p>}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Link href="/dashboard/scripts" className="flex-1"><Button variant="outline" size="sm" className="w-full"><FileCode className="h-4 w-4 mr-2" />Scripts</Button></Link>
                  <Link href="/dashboard/database" className="flex-1"><Button variant="outline" size="sm" className="w-full"><Database className="h-4 w-4 mr-2" />DB</Button></Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
