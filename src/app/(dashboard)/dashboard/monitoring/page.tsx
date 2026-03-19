"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  RefreshCw,
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
  Clock,
  Wifi,
  WifiOff,
  Activity,
} from "lucide-react";
import { formatBytes, formatDuration } from "@/lib/utils";

interface SystemStats {
  hostname: string;
  platform: string;
  distro: string;
  uptime: number;
  cpu: { usage: number; cores: number };
  memory: { total: number; used: number; usagePercent: number };
  disk: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  } | null;
}
interface Vps {
  id: string;
  name: string;
  host: string;
  agentPort: number;
  status: "online" | "offline";
  stats: SystemStats | null;
}

export default function MonitoringPage() {
  const [vpsList, setVpsList] = useState<Vps[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchVps = useCallback(async () => {
    try {
      const res = await fetch("/api/vps");
      const data = await res.json();
      if (data.success) setVpsList(data.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchVps();
    let interval: NodeJS.Timeout;
    if (autoRefresh) interval = setInterval(fetchVps, 5000);
    return () => clearInterval(interval);
  }, [fetchVps, autoRefresh]);

  const onlineVps = vpsList.filter((v) => v.status === "online");

  const totals = onlineVps.reduce(
    (acc, vps) => {
      if (vps.stats) {
        acc.cpu += vps.stats.cpu.usage;
        acc.memory.used += vps.stats.memory.used;
        acc.memory.total += vps.stats.memory.total;
        if (vps.stats.disk) {
          acc.disk.used += vps.stats.disk.used;
          acc.disk.total += vps.stats.disk.total;
        }
        acc.count++;
      }
      return acc;
    },
    {
      cpu: 0,
      memory: { used: 0, total: 0 },
      disk: { used: 0, total: 0 },
      count: 0,
    }
  );

  const avgCpu = totals.count > 0 ? totals.cpu / totals.count : 0;
  const memoryPercent =
    totals.memory.total > 0
      ? (totals.memory.used / totals.memory.total) * 100
      : 0;
  const diskPercent =
    totals.disk.total > 0 ? (totals.disk.used / totals.disk.total) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitoring</h1>
          <p className="text-muted-foreground">
            {onlineVps.length}/{vpsList.length} VPS en ligne
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity
              className={`h-4 w-4 mr-2 ${autoRefresh ? "animate-pulse" : ""}`}
            />
            {autoRefresh ? "Auto ON" : "Auto OFF"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setRefreshing(true);
              fetchVps();
            }}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            Actualiser
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <Server className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">VPS en ligne</p>
                <p className="text-2xl font-bold">
                  {onlineVps.length}/{vpsList.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Cpu className="h-6 w-6 text-blue-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">CPU Moyen</p>
                <p className="text-2xl font-bold">{avgCpu.toFixed(1)}%</p>
                <Progress value={avgCpu} className="mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-purple-500/10">
                <MemoryStick className="h-6 w-6 text-purple-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">RAM Totale</p>
                <p className="text-2xl font-bold">
                  {memoryPercent.toFixed(1)}%
                </p>
                <Progress value={memoryPercent} className="mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-orange-500/10">
                <HardDrive className="h-6 w-6 text-orange-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Disque Total</p>
                <p className="text-2xl font-bold">{diskPercent.toFixed(1)}%</p>
                <Progress value={diskPercent} className="mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {loading
          ? [1, 2].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6 h-48" />
              </Card>
            ))
          : vpsList.map((vps) => (
              <Card
                key={vps.id}
                className={vps.status === "offline" ? "opacity-60" : ""}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {vps.status === "online" ? (
                        <Wifi className="h-5 w-5 text-green-500" />
                      ) : (
                        <WifiOff className="h-5 w-5 text-red-500" />
                      )}
                      {vps.name}
                    </CardTitle>
                    <Badge
                      variant={
                        vps.status === "online" ? "success" : "destructive"
                      }
                    >
                      {vps.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">
                    {vps.host}:{vps.agentPort}
                  </p>
                </CardHeader>

                {vps.status === "online" && vps.stats ? (
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{vps.stats.distro || vps.stats.platform}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(vps.stats.uptime)}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="flex items-center gap-1">
                            <Cpu className="h-3 w-3 text-blue-500" />
                            CPU
                          </span>
                          <span className="font-mono">
                            {vps.stats.cpu.usage.toFixed(1)}%
                          </span>
                        </div>
                        <Progress value={vps.stats.cpu.usage} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="flex items-center gap-1">
                            <MemoryStick className="h-3 w-3 text-purple-500" />
                            RAM
                          </span>
                          <span className="font-mono">
                            {vps.stats.memory.usagePercent.toFixed(1)}%
                          </span>
                        </div>
                        <Progress value={vps.stats.memory.usagePercent} />
                      </div>
                      {vps.stats.disk && (
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="flex items-center gap-1">
                              <HardDrive className="h-3 w-3 text-orange-500" />
                              Disk
                            </span>
                            <span className="font-mono">
                              {vps.stats.disk.usagePercent.toFixed(1)}%
                            </span>
                          </div>
                          <Progress value={vps.stats.disk.usagePercent} />
                        </div>
                      )}
                    </div>
                  </CardContent>
                ) : (
                  <CardContent>
                    <div className="flex items-center justify-center py-4 text-muted-foreground">
                      <WifiOff className="h-5 w-5 mr-2" />
                      VPS hors ligne
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
      </div>
    </div>
  );
}
