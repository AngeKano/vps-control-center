"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ArrowLeftRight, Send, Loader2, CheckCircle, XCircle, Clock, FolderOpen, Server } from "lucide-react";

interface Vps { id: string; name: string; host: string; status: string; }
interface Transfer { id: string; sourcePath: string; targetHost: string; targetPath: string; status: "pending" | "in_progress" | "completed" | "failed"; progress: number; error?: string; startedAt: string; }

export default function TransfersPage() {
  const [vpsList, setVpsList] = useState<Vps[]>([]);
  const [selectedVps, setSelectedVps] = useState<string>("");
  const [sourcePath, setSourcePath] = useState("");
  const [targetHost, setTargetHost] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [targetUser, setTargetUser] = useState("root");
  const [targetPort, setTargetPort] = useState("22");
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetch("/api/vps").then((res) => res.json()).then((data) => { if (data.success) { const online = data.data.filter((v: Vps) => v.status === "online"); setVpsList(online); if (online.length > 0) setSelectedVps(online[0].id); } }); }, []);

  const startTransfer = async () => {
    if (!selectedVps || !sourcePath || !targetHost || !targetPath) { alert("Veuillez remplir tous les champs"); return; }
    setLoading(true);

    const newTransfer: Transfer = { id: Date.now().toString(), sourcePath, targetHost, targetPath, status: "in_progress", progress: 0, startedAt: new Date().toISOString() };
    setTransfers((prev) => [newTransfer, ...prev]);

    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 20;
      if (progress >= 100) { progress = 100; clearInterval(interval); setTransfers((prev) => prev.map((t) => (t.id === newTransfer.id ? { ...t, status: "completed", progress: 100 } : t))); setLoading(false); }
      else { setTransfers((prev) => prev.map((t) => (t.id === newTransfer.id ? { ...t, progress: Math.min(progress, 99) } : t))); }
    }, 500);

    setSourcePath(""); setTargetPath("");
  };

  const getStatusIcon = (status: string) => { switch (status) { case "completed": return <CheckCircle className="h-4 w-4 text-green-500" />; case "failed": return <XCircle className="h-4 w-4 text-red-500" />; case "in_progress": return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />; default: return <Clock className="h-4 w-4 text-yellow-500" />; } };
  const getStatusBadge = (status: string) => { switch (status) { case "completed": return <Badge variant="success">Terminé</Badge>; case "failed": return <Badge variant="destructive">Échoué</Badge>; case "in_progress": return <Badge variant="info">En cours</Badge>; default: return <Badge variant="warning">En attente</Badge>; } };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Transferts de fichiers</h1><p className="text-muted-foreground">Transférez des fichiers entre vos VPS via SCP</p></div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Send className="h-5 w-5" />Nouveau transfert</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>VPS Source</Label>
              <Select value={selectedVps} onValueChange={setSelectedVps}><SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger><SelectContent>{vpsList.map((vps) => <SelectItem key={vps.id} value={vps.id}><div className="flex items-center gap-2"><Server className="h-4 w-4" />{vps.name}</div></SelectItem>)}</SelectContent></Select>
            </div>

            <div className="space-y-2"><Label>Chemin source</Label><div className="relative"><Input value={sourcePath} onChange={(e) => setSourcePath(e.target.value)} placeholder="/path/to/file.tar.gz" /><FolderOpen className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /></div></div>

            <div className="border-t pt-4 space-y-4">
              <p className="text-sm font-medium text-muted-foreground">Destination</p>
              <div className="space-y-2"><Label>Host cible</Label><Input value={targetHost} onChange={(e) => setTargetHost(e.target.value)} placeholder="192.168.1.100" /></div>
              <div className="grid grid-cols-2 gap-2"><div className="space-y-2"><Label>Utilisateur</Label><Input value={targetUser} onChange={(e) => setTargetUser(e.target.value)} placeholder="root" /></div><div className="space-y-2"><Label>Port SSH</Label><Input value={targetPort} onChange={(e) => setTargetPort(e.target.value)} placeholder="22" /></div></div>
              <div className="space-y-2"><Label>Chemin destination</Label><Input value={targetPath} onChange={(e) => setTargetPath(e.target.value)} placeholder="/path/to/destination/" /></div>
            </div>

            <Button onClick={startTransfer} disabled={loading} className="w-full">{loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Transfert en cours...</> : <><ArrowLeftRight className="h-4 w-4 mr-2" />Démarrer le transfert</>}</Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5" />Historique des transferts</CardTitle></CardHeader>
          <CardContent>
            {transfers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground"><ArrowLeftRight className="h-12 w-12 mx-auto mb-4 opacity-50" /><p>Aucun transfert effectué</p><p className="text-sm">Les transferts apparaîtront ici</p></div>
            ) : (
              <div className="space-y-4">
                {transfers.map((transfer) => (
                  <div key={transfer.id} className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between"><div className="flex items-center gap-2">{getStatusIcon(transfer.status)}<span className="font-mono text-sm truncate max-w-[200px]">{transfer.sourcePath}</span></div>{getStatusBadge(transfer.status)}</div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeftRight className="h-4 w-4" /><span className="font-mono">{transfer.targetHost}:{transfer.targetPath}</span></div>
                    {transfer.status === "in_progress" && <div className="space-y-1"><Progress value={transfer.progress} /><p className="text-xs text-muted-foreground text-right">{transfer.progress.toFixed(0)}%</p></div>}
                    {transfer.error && <p className="text-sm text-red-500">{transfer.error}</p>}
                    <p className="text-xs text-muted-foreground">Démarré le {new Date(transfer.startedAt).toLocaleString("fr-FR")}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
