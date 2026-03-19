"use client";

import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut, User } from "lucide-react";

const roleColors: Record<string, "default" | "success" | "warning" | "destructive"> = {
  ADMIN: "destructive",
  OPERATOR: "warning",
  VIEWER: "default",
};

const roleLabels: Record<string, string> = {
  ADMIN: "Admin",
  OPERATOR: "Opérateur",
  VIEWER: "Lecteur",
};

export function UserMenu() {
  const { data: session } = useSession();

  if (!session?.user) return null;

  const role = session.user.role || "VIEWER";

  return (
    <div className="flex items-center gap-3 p-4 border-t border-border">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-full bg-muted">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{session.user.name || session.user.email}</p>
            <Badge variant={roleColors[role]} className="text-xs mt-0.5">{roleLabels[role] || role}</Badge>
          </div>
        </div>
      </div>
      <Button variant="ghost" size="icon" onClick={() => signOut({ callbackUrl: "/login" })} title="Déconnexion">
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}
