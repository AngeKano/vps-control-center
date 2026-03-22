"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Server, AlertCircle } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError("Email ou mot de passe incorrect");
      } else if (result?.ok) {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const demoCredentials = {
    admin: { email: "admin@vpscontrol.local", password: "Admin2025!" },
    operator: { email: "operator@vpscontrol.local", password: "Operator2025!" },
    viewer: { email: "viewer@vpscontrol.local", password: "Viewer2025!" },
  };

  const handleDemoLogin = (role: "admin" | "operator" | "viewer") => {
    setError("");
    setEmail(demoCredentials[role].email);
    setPassword(demoCredentials[role].password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 rounded-full bg-primary/10 w-fit">
            <Server className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">VPS Control Center</CardTitle>
          <CardDescription>Connectez-vous pour accéder au dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 text-sm text-red-500 bg-red-500/10 rounded-lg">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="admin@vpscontrol.local" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} autoComplete="email" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} autoComplete="current-password" />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connexion...</> : "Se connecter"}
            </Button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Accès rapide (démo)</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => handleDemoLogin("admin")} disabled={loading}>Admin</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handleDemoLogin("operator")} disabled={loading}>Operator</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handleDemoLogin("viewer")} disabled={loading}>Viewer</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
