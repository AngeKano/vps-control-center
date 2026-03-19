"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Database, Play, Save, Loader2, Table, Clock, AlertCircle } from "lucide-react";

interface SavedQuery { id: string; name: string; description: string | null; query: string; database: string; }
interface Project { id: string; name: string; queries: SavedQuery[]; }
interface QueryResult { columns: string[]; rows: Record<string, unknown>[]; rowCount: number; executionTime: number; }

export default function DatabasePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [query, setQuery] = useState("SELECT 1 AS test");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);

  useEffect(() => { fetch("/api/projects").then((res) => res.json()).then((data) => { if (data.success && data.data.length > 0) { setProjects(data.data); setSelectedProject(data.data[0].id); setSavedQueries(data.data[0].queries || []); } }); }, []);

  useEffect(() => { const project = projects.find((p) => p.id === selectedProject); if (project) setSavedQueries(project.queries || []); }, [selectedProject, projects]);

  const executeQuery = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setResult({ columns: ["id", "name", "value", "created_at"], rows: [{ id: 1, name: "Example 1", value: 100, created_at: "2025-01-12 10:00:00" }, { id: 2, name: "Example 2", value: 200, created_at: "2025-01-12 11:00:00" }, { id: 3, name: "Example 3", value: 300, created_at: "2025-01-12 12:00:00" }], rowCount: 3, executionTime: 0.045 });
    } catch { setError("Erreur lors de l'exécution de la requête"); }
    finally { setLoading(false); }
  };

  const loadSavedQuery = (savedQuery: SavedQuery) => { setQuery(savedQuery.query); setResult(null); setError(null); };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Database Tools</h1><p className="text-muted-foreground">Exécutez des requêtes sur vos bases ClickHouse</p></div>
        <Select value={selectedProject} onValueChange={setSelectedProject}><SelectTrigger className="w-[200px]"><SelectValue placeholder="Projet" /></SelectTrigger><SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="space-y-4">
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Save className="h-4 w-4" />Requêtes sauvegardées</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {savedQueries.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Aucune requête</p> : savedQueries.map((sq) => (
                <button key={sq.id} onClick={() => loadSavedQuery(sq)} className="w-full text-left p-2 rounded-lg hover:bg-muted transition-colors">
                  <p className="font-medium text-sm truncate">{sq.name}</p>
                  {sq.description && <p className="text-xs text-muted-foreground truncate">{sq.description}</p>}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm">Configuration ClickHouse</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Host</span><span className="font-mono">localhost</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Port</span><span className="font-mono">8123</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Database</span><span className="font-mono">default</span></div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader className="py-3 flex-row items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4" />Éditeur SQL</CardTitle>
              <Button onClick={executeQuery} disabled={loading || !query.trim()}>{loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}Exécuter</Button>
            </CardHeader>
            <CardContent>
              <textarea value={query} onChange={(e) => setQuery(e.target.value)} className="w-full h-32 p-3 font-mono text-sm bg-muted rounded-lg border-0 focus:ring-1 focus:ring-primary resize-none" placeholder="SELECT * FROM table LIMIT 10" spellCheck={false} />
            </CardContent>
          </Card>

          <Card className="min-h-[300px]">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Table className="h-4 w-4" />Résultats
                {result && <><Badge variant="secondary" className="ml-2">{result.rowCount} ligne{result.rowCount > 1 ? "s" : ""}</Badge><span className="text-xs text-muted-foreground ml-auto flex items-center gap-1"><Clock className="h-3 w-3" />{result.executionTime.toFixed(3)}s</span></>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {error ? (
                <div className="flex items-center gap-2 p-4 bg-red-500/10 text-red-500 rounded-lg"><AlertCircle className="h-5 w-5 shrink-0" /><p className="text-sm">{error}</p></div>
              ) : result ? (
                <div className="overflow-auto max-h-[400px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card"><tr className="border-b">{result.columns.map((col) => <th key={col} className="text-left p-2 font-medium">{col}</th>)}</tr></thead>
                    <tbody>{result.rows.map((row, i) => <tr key={i} className="border-b border-muted hover:bg-muted/50">{result.columns.map((col) => <td key={col} className="p-2 font-mono text-xs">{String(row[col] ?? "NULL")}</td>)}</tr>)}</tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground"><Database className="h-12 w-12 mb-4 opacity-50" /><p>Exécutez une requête pour voir les résultats</p></div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
