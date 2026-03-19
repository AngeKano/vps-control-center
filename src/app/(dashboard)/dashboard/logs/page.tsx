"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Terminal, Trash2, Pause, Play, Wifi, WifiOff } from "lucide-react";
import { io, Socket } from "socket.io-client";

interface Vps {
  id: string;
  name: string;
  host: string;
  agentPort: number;
  status: string;
}
interface PM2Process {
  pm_id: number;
  name: string;
  status: string;
}
interface LogEntry {
  timestamp: string;
  type: "out" | "err";
  data: string;
}

export default function LogsPage() {
  const [vpsList, setVpsList] = useState<Vps[]>([]);
  const [selectedVps, setSelectedVps] = useState<Vps | null>(null);
  const [processes, setProcesses] = useState<PM2Process[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<string>("");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/vps")
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          const online = data.data.filter((v: Vps) => v.status === "online");
          setVpsList(online);
          if (online.length > 0) setSelectedVps(online[0]);
        }
      });
  }, []);

  useEffect(() => {
    if (!selectedVps) return;
    fetch(`/api/vps/${selectedVps.id}/pm2`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setProcesses(data.data);
          if (data.data.length > 0) setSelectedProcess(data.data[0].name);
        }
      });
  }, [selectedVps]);

  useEffect(() => {
    if (!selectedVps || !selectedProcess) return;

    const apiKey =
      "e395312557f127917b675550d46be19fcde303ce454ffec550ac0a024c77a8e4";
    const socket = io(`http://${selectedVps.host}:${selectedVps.agentPort}`, {
      auth: { apiKey },
      reconnection: true,
    });

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("logs:subscribe", { processName: selectedProcess });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("logs:data", (log: LogEntry) => {
      if (!paused) setLogs((prev) => [...prev.slice(-499), log]);
    });

    socketRef.current = socket;

    return () => {
      socket.emit("logs:unsubscribe", { processName: selectedProcess });
      socket.disconnect();
    };
  }, [selectedVps, selectedProcess, paused]);

  useEffect(() => {
    if (!paused && logsRef.current)
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs, paused]);

  const getLogColor = (log: LogEntry) => {
    if (log.type === "err") return "text-red-400";
    const lower = log.data.toLowerCase();
    if (lower.includes("error")) return "text-red-400";
    if (lower.includes("warn")) return "text-yellow-400";
    if (lower.includes("success") || lower.includes("✓"))
      return "text-green-400";
    return "text-gray-300";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Logs en temps réel</h1>
          <p className="text-muted-foreground">
            Visualisez les logs de vos scripts PM2
          </p>
        </div>
        <Badge
          variant={connected ? "success" : "destructive"}
          className="gap-1"
        >
          {connected ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          {connected ? "Connecté" : "Déconnecté"}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">VPS</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedVps?.id || ""}
                onValueChange={(id) => {
                  const vps = vpsList.find((v) => v.id === id);
                  if (vps) {
                    setSelectedVps(vps);
                    setSelectedProcess("");
                    setLogs([]);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un VPS" />
                </SelectTrigger>
                <SelectContent>
                  {vpsList.map((vps) => (
                    <SelectItem key={vps.id} value={vps.id}>
                      {vps.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Processus</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedProcess}
                onValueChange={(name) => {
                  setSelectedProcess(name);
                  setLogs([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  {processes.map((p) => (
                    <SelectItem key={p.pm_id} value={p.name}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          <Card className="h-[calc(100vh-220px)]">
            <CardHeader className="py-3 flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Terminal className="h-4 w-4" />
                {selectedProcess || "Sélectionnez un processus"}
                <span className="text-xs text-muted-foreground font-normal">
                  ({logs.length} lignes)
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPaused(!paused)}
                >
                  {paused ? (
                    <Play className="h-4 w-4 mr-1" />
                  ) : (
                    <Pause className="h-4 w-4 mr-1" />
                  )}
                  {paused ? "Reprendre" : "Pause"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setLogs([])}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Effacer
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 h-[calc(100%-60px)]">
              <div
                ref={logsRef}
                className="h-full overflow-auto bg-gray-950 rounded-b-lg p-4 font-mono text-sm log-viewer"
              >
                {logs.length === 0 ? (
                  <div className="text-gray-500 text-center py-8">
                    En attente des logs...
                  </div>
                ) : (
                  logs.map((log, i) => (
                    <div
                      key={i}
                      className="flex gap-2 hover:bg-gray-900/50 px-1 -mx-1 rounded"
                    >
                      <span className="text-gray-600 shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString("fr-FR")}
                      </span>
                      <span className={getLogColor(log)}>{log.data}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
