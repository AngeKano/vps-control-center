"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
  Cpu,
  MemoryStick,
  HardDrive,
  Clock,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Check,
} from "lucide-react";
import { formatBytes, formatDuration } from "@/lib/utils";

interface SystemStats {
  hostname: string;
  platform: string;
  distro: string;
  uptime: number;
  cpu: { usage: number; cores: number; model: string };
  memory: { total: number; used: number; free: number; usagePercent: number };
  disk: {
    total: number;
    used: number;
    free: number;
    usagePercent: number;
  } | null;
}

interface VpsData {
  id: string;
  name: string;
  host: string;
  port: number;
  agentPort: number;
  username?: string;
  description?: string;
  status: "online" | "offline";
  stats: SystemStats | null;
}

interface VpsFormData {
  name: string;
  host: string;
  port: number;
  agentPort: number;
  username: string;
  description: string;
}

const defaultFormData: VpsFormData = {
  name: "",
  host: "",
  port: 22,
  agentPort: 4000,
  username: "root",
  description: "",
};

export default function VpsPage() {
  const [vpsList, setVpsList] = useState<VpsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingVps, setEditingVps] = useState<VpsData | null>(null);
  const [formData, setFormData] = useState<VpsFormData>(defaultFormData);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchVps = useCallback(async () => {
    try {
      const res = await fetch("/api/vps");
      const data = await res.json();
      console.log("data_", data);
      if (data.success) setVpsList(data.data);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchVps();
    const interval = setInterval(fetchVps, 30000);
    return () => clearInterval(interval);
  }, [fetchVps]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchVps();
  };

  // Open modal for create
  const handleAdd = () => {
    setEditingVps(null);
    setFormData(defaultFormData);
    setShowModal(true);
  };

  // Open modal for edit
  const handleEdit = (vps: VpsData) => {
    setEditingVps(vps);
    setFormData({
      name: vps.name,
      host: vps.host,
      port: vps.port,
      agentPort: vps.agentPort,
      username: vps.username || "root",
      description: vps.description || "",
    });
    setShowModal(true);
  };

  // Save (create or update)
  const handleSave = async () => {
    if (!formData.name || !formData.host) {
      alert("Nom et Host sont requis");
      return;
    }

    setSaving(true);
    try {
      const url = editingVps ? `/api/vps/${editingVps.id}` : "/api/vps";
      const method = editingVps ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        fetchVps();
      } else {
        alert(data.error || "Erreur lors de la sauvegarde");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async (vps: VpsData) => {
    if (!confirm(`Supprimer le VPS "${vps.name}" ?`)) return;

    setDeleting(vps.id);
    try {
      const res = await fetch(`/api/vps/${vps.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchVps();
      } else {
        alert(data.error || "Erreur lors de la suppression");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Erreur lors de la suppression");
    } finally {
      setDeleting(null);
    }
  };

  // Test connection
  const handleTestConnection = async () => {
    if (!formData.host || !formData.agentPort) {
      alert("Entrez le host et port de l'agent");
      return;
    }

    try {
      const res = await fetch(
        `http://${formData.host}:${formData.agentPort}/health`,
        {
          signal: AbortSignal.timeout(5000),
        }
      );
      if (res.ok) {
        alert("✅ Connexion réussie !");
      } else {
        alert("❌ Agent non accessible");
      }
    } catch {
      alert(
        "❌ Impossible de joindre l'agent. Vérifiez:\n- L'agent est démarré\n- Le port est ouvert\n- CORS est configuré"
      );
    }
  };

  const onlineCount = vpsList.filter((v) => v.status === "online").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestion VPS</h1>
          <p className="text-muted-foreground">
            {onlineCount}/{vpsList.length} VPS en ligne
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Ajouter VPS
          </Button>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`}
            />
            Actualiser
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-80 rounded-xl border bg-card animate-pulse"
            />
          ))}
        </div>
      ) : vpsList.length === 0 ? (
        <div className="text-center py-16">
          <Server className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Aucun VPS configuré</h2>
          <p className="text-muted-foreground mb-4">
            Ajoutez votre premier VPS pour commencer
          </p>
          <Button onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Ajouter un VPS
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {vpsList.map((vps) => (
            <Card
              key={vps.id}
              className={vps.status === "offline" ? "opacity-60" : ""}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        vps.status === "online"
                          ? "bg-green-500/10"
                          : "bg-red-500/10"
                      }`}
                    >
                      {vps.status === "online" ? (
                        <Wifi className="h-5 w-5 text-green-500" />
                      ) : (
                        <WifiOff className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{vps.name}</CardTitle>
                      <p className="text-xs text-muted-foreground font-mono">
                        {vps.host}:{vps.agentPort}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        vps.status === "online" ? "success" : "destructive"
                      }
                    >
                      {vps.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(vps)}
                      title="Modifier"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(vps)}
                      disabled={deleting === vps.id}
                      title="Supprimer"
                    >
                      {deleting === vps.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-red-500" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>

              {vps.status === "online" && vps.stats ? (
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>{vps.stats.distro || vps.stats.platform}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Uptime: {formatDuration(vps.stats.uptime)}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Cpu className="h-4 w-4 text-blue-500" />
                        CPU ({vps.stats.cpu.cores} cores)
                      </span>
                      <span className="font-mono">
                        {vps.stats.cpu.usage.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={vps.stats.cpu.usage} />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <MemoryStick className="h-4 w-4 text-purple-500" />
                        RAM
                      </span>
                      <span className="font-mono">
                        {vps.stats.memory.usagePercent.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={vps.stats.memory.usagePercent} />
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(vps.stats.memory.used)} /{" "}
                      {formatBytes(vps.stats.memory.total)}
                    </p>
                  </div>

                  {vps.stats.disk && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-orange-500" />
                          Disque
                        </span>
                        <span className="font-mono">
                          {vps.stats.disk.usagePercent.toFixed(1)}%
                        </span>
                      </div>
                      <Progress value={vps.stats.disk.usagePercent} />
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(vps.stats.disk.free)} libre sur{" "}
                        {formatBytes(vps.stats.disk.total)}
                      </p>
                    </div>
                  )}
                </CardContent>
              ) : (
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>VPS hors ligne</p>
                    <p className="text-xs mt-1">
                      Vérifiez que l&apos;agent est démarré
                    </p>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal Ajouter/Modifier */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowModal(false)}
          />
          <Card className="relative z-10 w-full max-w-lg mx-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                {editingVps ? "Modifier le VPS" : "Ajouter un VPS"}
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowModal(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nom *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Mon VPS"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="host">Host / IP *</Label>
                  <Input
                    id="host"
                    value={formData.host}
                    onChange={(e) =>
                      setFormData({ ...formData, host: e.target.value })
                    }
                    placeholder="145.223.33.245"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="port">Port SSH</Label>
                  <Input
                    id="port"
                    type="number"
                    value={formData.port}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        port: parseInt(e.target.value) || 22,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agentPort">Port Agent</Label>
                  <Input
                    id="agentPort"
                    type="number"
                    value={formData.agentPort}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        agentPort: parseInt(e.target.value) || 4000,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Utilisateur</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) =>
                      setFormData({ ...formData, username: e.target.value })
                    }
                    placeholder="root"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Serveur de production"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  type="button"
                >
                  <Wifi className="h-4 w-4 mr-2" />
                  Tester connexion
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setShowModal(false)}>
                    Annuler
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    {editingVps ? "Modifier" : "Ajouter"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
