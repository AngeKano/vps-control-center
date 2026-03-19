"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Database, Bell, Shield, Server, Save, Loader2, CheckCircle, Key, User } from "lucide-react";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [clickhouseHost, setClickhouseHost] = useState("localhost");
  const [clickhousePort, setClickhousePort] = useState("8123");
  const [clickhouseDatabase, setClickhouseDatabase] = useState("default");
  const [clickhouseUser, setClickhouseUser] = useState("default");
  const [clickhousePassword, setClickhousePassword] = useState("");

  const [emailEnabled, setEmailEnabled] = useState(false);
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackWebhook, setSlackWebhook] = useState("");

  const handleSave = async () => { setSaving(true); await new Promise((resolve) => setTimeout(resolve, 1000)); setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000); };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Paramètres</h1><p className="text-muted-foreground">Configurez votre instance VPS Control Center</p></div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general" className="gap-2"><Settings className="h-4 w-4" />Général</TabsTrigger>
          <TabsTrigger value="database" className="gap-2"><Database className="h-4 w-4" />Database</TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2"><Bell className="h-4 w-4" />Notifications</TabsTrigger>
          <TabsTrigger value="security" className="gap-2"><Shield className="h-4 w-4" />Sécurité</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><User className="h-5 w-5" />Profil utilisateur</CardTitle><CardDescription>Informations de votre compte</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>Email</Label><Input value={session?.user?.email || ""} disabled /></div>
                <div className="space-y-2"><Label>Nom</Label><Input value={session?.user?.name || ""} disabled /></div>
              </div>
              <div className="flex items-center gap-2"><Label>Rôle</Label><Badge variant={session?.user?.role === "ADMIN" ? "destructive" : "secondary"}>{session?.user?.role || "N/A"}</Badge></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" />Agent VPS</CardTitle><CardDescription>Configuration de la communication avec les agents</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Clé API (VPS_API_KEY)</Label>
                <div className="flex gap-2"><Input type="password" value="••••••••••••••••" disabled className="font-mono" /><Button variant="outline" size="icon"><Key className="h-4 w-4" /></Button></div>
                <p className="text-xs text-muted-foreground">La clé API est définie dans le fichier .env et doit correspondre sur tous les agents</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="database" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />ClickHouse</CardTitle><CardDescription>Configuration de la connexion ClickHouse</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>Host</Label><Input value={clickhouseHost} onChange={(e) => setClickhouseHost(e.target.value)} placeholder="localhost" /></div>
                <div className="space-y-2"><Label>Port</Label><Input value={clickhousePort} onChange={(e) => setClickhousePort(e.target.value)} placeholder="8123" /></div>
              </div>
              <div className="space-y-2"><Label>Database</Label><Input value={clickhouseDatabase} onChange={(e) => setClickhouseDatabase(e.target.value)} placeholder="default" /></div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label>Utilisateur</Label><Input value={clickhouseUser} onChange={(e) => setClickhouseUser(e.target.value)} placeholder="default" /></div>
                <div className="space-y-2"><Label>Mot de passe</Label><Input type="password" value={clickhousePassword} onChange={(e) => setClickhousePassword(e.target.value)} /></div>
              </div>
              <Button variant="outline">Tester la connexion</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Notifications</CardTitle><CardDescription>Configurez les alertes et notifications</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div><p className="font-medium">Notifications par email</p><p className="text-sm text-muted-foreground">Recevez des alertes par email</p></div>
                <Button variant={emailEnabled ? "default" : "outline"} onClick={() => setEmailEnabled(!emailEnabled)}>{emailEnabled ? "Activé" : "Désactivé"}</Button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div><p className="font-medium">Slack</p><p className="text-sm text-muted-foreground">Envoyez des alertes sur Slack</p></div>
                  <Button variant={slackEnabled ? "default" : "outline"} onClick={() => setSlackEnabled(!slackEnabled)}>{slackEnabled ? "Activé" : "Désactivé"}</Button>
                </div>
                {slackEnabled && <div className="space-y-2 pl-4"><Label>Webhook URL</Label><Input value={slackWebhook} onChange={(e) => setSlackWebhook(e.target.value)} placeholder="https://hooks.slack.com/services/..." /></div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Sécurité</CardTitle><CardDescription>Paramètres de sécurité de l&apos;application</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 border rounded-lg space-y-2">
                <p className="font-medium">Rôles et permissions</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><Badge variant="destructive">ADMIN</Badge><span className="text-muted-foreground">Accès complet, gestion des VPS et utilisateurs</span></div>
                  <div className="flex items-center gap-2"><Badge variant="warning">OPERATOR</Badge><span className="text-muted-foreground">Contrôle des scripts, lecture des logs</span></div>
                  <div className="flex items-center gap-2"><Badge variant="secondary">VIEWER</Badge><span className="text-muted-foreground">Lecture seule, monitoring</span></div>
                </div>
              </div>
              <div className="p-4 border rounded-lg space-y-2"><p className="font-medium">Sessions actives</p><p className="text-sm text-muted-foreground">Durée de session : 30 jours</p></div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex items-center justify-end gap-4">
        {saved && <span className="flex items-center gap-2 text-green-500"><CheckCircle className="h-4 w-4" />Paramètres sauvegardés</span>}
        <Button onClick={handleSave} disabled={saving}>{saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sauvegarde...</> : <><Save className="h-4 w-4 mr-2" />Sauvegarder</>}</Button>
      </div>
    </div>
  );
}
