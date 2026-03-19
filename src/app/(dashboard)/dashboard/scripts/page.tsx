"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Play,
  Square,
  RotateCcw,
  FileCode,
  Server,
  Clock,
  Loader2,
  FolderKanban,
} from "lucide-react";
import { formatDuration, getStatusBadgeVariant } from "@/lib/utils";

interface PM2Status {
  status: string;
  uptime: number;
  cpu: number;
  memory: number;
  restarts: number;
  pm_id: number;
}

interface Script {
  id: string;
  name: string;
  filename: string;
  command: string;
  description: string | null;
  workingDir: string | null;
  order: number;
  vps: { id: string; name: string; host: string; agentPort: number };
  project: {
    id: string;
    name: string;
    slug: string;
    color: string;
    workingDir: string | null;
  };
  pm2Status: PM2Status | null;
}

export default function ScriptsPage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchScripts = useCallback(async () => {
    try {
      const res = await fetch("/api/scripts");
      const data = await res.json();
      if (data.success) setScripts(data.data);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchScripts();
    const interval = setInterval(fetchScripts, 10000);
    return () => clearInterval(interval);
  }, [fetchScripts]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchScripts();
  };

  const handleAction = async (
    action: "start" | "stop" | "restart",
    script: Script
  ) => {
    setActionLoading(`${script.id}-${action}`);
    try {
      const workingDir =
        script.workingDir ||
        script.project.workingDir ||
        `/opt/${script.project.slug}`;
      const body: Record<string, unknown> = {
        action: action === "start" ? "run-script" : action,
      };

      if (action === "start") {
        body.cwd = workingDir;
        body.script = script.command.replace("npm run ", "");
        body.name = script.name;
      } else {
        body.processName = script.pm2Status?.pm_id?.toString() || script.name;
      }

      const res = await fetch(`/api/vps/${script.vps.id}/pm2`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.success) alert(`Erreur: ${data.error}`);
      setTimeout(fetchScripts, 1500);
    } catch (error) {
      console.error("Error:", error);
      alert("Erreur lors de l'exécution");
    } finally {
      setActionLoading(null);
    }
  };

  const scriptsByProject = scripts.reduce((acc, script) => {
    const key = script.project.id;
    if (!acc[key]) acc[key] = { project: script.project, scripts: [] };
    acc[key].scripts.push(script);
    return acc;
  }, {} as Record<string, { project: Script["project"]; scripts: Script[] }>);

  const runningCount = scripts.filter(
    (s) => s.pm2Status?.status === "online"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestion des Scripts</h1>
          <p className="text-muted-foreground">
            {runningCount}/{scripts.length} scripts en cours
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
          />
          Actualiser
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 rounded-xl border bg-card animate-pulse"
            />
          ))}
        </div>
      ) : Object.keys(scriptsByProject).length === 0 ? (
        <div className="text-center py-16">
          <FileCode className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Aucun script configuré</h2>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(scriptsByProject).map(
            ([projectId, { project, scripts: projectScripts }]) => (
              <Card key={projectId}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FolderKanban className="h-5 w-5" />
                      {project.name}
                    </CardTitle>
                    <Badge variant="secondary">
                      {projectScripts.length} scripts
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {projectScripts.map((script) => {
                    const isRunning = script.pm2Status?.status === "online";
                    const isLoading = actionLoading?.startsWith(script.id);

                    return (
                      <div
                        key={script.id}
                        className="flex items-center justify-between p-4 rounded-lg border bg-muted/30"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <FileCode className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-medium">{script.name}</span>
                            <Badge
                              variant={getStatusBadgeVariant(
                                script.pm2Status?.status || "stopped"
                              )}
                            >
                              {script.pm2Status?.status || "Inactif"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono mb-1">
                            {script.command}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Server className="h-3 w-3" />
                              {script.vps.name}
                            </span>
                            {isRunning && script.pm2Status && (
                              <>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDuration(
                                    Math.floor(
                                      (Date.now() - script.pm2Status.uptime) /
                                        1000
                                    )
                                  )}
                                </span>
                                <span>
                                  CPU: {script.pm2Status.cpu.toFixed(1)}%
                                </span>
                                <span>
                                  RAM:{" "}
                                  {(
                                    script.pm2Status.memory /
                                    1024 /
                                    1024
                                  ).toFixed(0)}{" "}
                                  MB
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          {isRunning ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAction("restart", script)}
                                disabled={isLoading}
                              >
                                {actionLoading === `${script.id}-restart` ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleAction("stop", script)}
                                disabled={isLoading}
                              >
                                {actionLoading === `${script.id}-stop` ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Square className="h-4 w-4" />
                                )}
                              </Button>
                            </>
                          ) : (
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => handleAction("start", script)}
                              disabled={isLoading}
                            >
                              {actionLoading === `${script.id}-start` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Play className="h-4 w-4 mr-1" />
                                  Démarrer
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}
