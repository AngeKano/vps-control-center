"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UserMenu } from "@/components/auth/user-menu";
import { LayoutDashboard, Server, FileCode, Terminal, FolderKanban, Activity, Database, ArrowLeftRight, Settings, Workflow } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/projects", label: "Projets", icon: FolderKanban },
  { href: "/dashboard/vps", label: "VPS", icon: Server },
  { href: "/dashboard/automations", label: "Automatisations", icon: Workflow },
  { href: "/dashboard/scripts", label: "Scripts", icon: FileCode },
  { href: "/dashboard/logs", label: "Logs", icon: Terminal },
  { href: "/dashboard/database", label: "Database", icon: Database },
  { href: "/dashboard/transfers", label: "Transferts", icon: ArrowLeftRight },
  { href: "/dashboard/monitoring", label: "Monitoring", icon: Activity },
  { href: "/dashboard/settings", label: "Paramètres", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-card">
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-border px-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Server className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span className="font-bold text-lg">VPS Control</span>
            <p className="text-xs text-muted-foreground">Dashboard</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          {links.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href !== "/dashboard" && pathname.startsWith(link.href));

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <UserMenu />
      </div>
    </aside>
  );
}
