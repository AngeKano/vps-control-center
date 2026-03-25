"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  ReactFlowProvider,
  Panel,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Save,
  Play,
  Square,
  ArrowLeft,
  Loader2,
  Plus,
  X,
  Server,
  Trash2,
  ChevronRight,
  Terminal,
  FolderSync,
  DatabaseZap,
  Database,
  Map,
  CloudUpload,
  CheckCircle2,
  AlertCircle,
  FileText,
  RefreshCw,
  RotateCcw,
  Eye,
  Pencil,
  FolderOpen,
  ScrollText,
  Circle,
  ZoomIn,
  ZoomOut,
  Maximize,
  Lock,
  Unlock,
} from "lucide-react";
import { formatDate, getStatusBadgeVariant } from "@/lib/utils";
import type {
  Automation,
  AutomationVps,
  AutomationNodeData,
  NodeType,
  PM2Config,
  SSHConfig,
  SCPConfig,
  DBExportConfig,
  DBImportConfig,
  TippecanoeConfig,
  S3Config,
  AutomationRun,
  NodeState,
} from "@/types/automation";
import {
  NODE_TYPE_LABELS,
  AUTOMATION_STATUS_LABELS,
  AUTOMATION_TYPE_LABELS,
} from "@/types/automation";

// ==========================================
// Helpers
// ==========================================

function getNodeData(node: Node): AutomationNodeData {
  return node.data as unknown as AutomationNodeData;
}

// ==========================================
// Custom Canvas Controls
// ==========================================

function CanvasControls({ locked, onToggleLock }: { locked: boolean; onToggleLock: () => void }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <Panel position="bottom-left">
      <div className="flex flex-col gap-1 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-1.5 shadow-lg">
        <button
          onClick={() => zoomIn({ duration: 200 })}
          className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom avant"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          onClick={() => zoomOut({ duration: 200 })}
          className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom arrière"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={() => fitView({ padding: 0.2, duration: 300 })}
          className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Recentrer la vue"
        >
          <Maximize className="h-4 w-4" />
        </button>
        <div className="h-px bg-border my-0.5" />
        <button
          onClick={onToggleLock}
          className={`p-2 rounded-md transition-colors ${
            locked
              ? "bg-destructive/10 text-destructive"
              : "hover:bg-accent text-muted-foreground hover:text-foreground"
          }`}
          title={locked ? "Déverrouiller (éditer les noeuds)" : "Verrouiller (navigation seule)"}
        >
          {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
        </button>
      </div>
    </Panel>
  );
}

// ==========================================
// Custom Node Component
// ==========================================

const NODE_ICONS: Record<NodeType, typeof Terminal> = {
  pm2_script: Play,
  ssh_command: Terminal,
  scp_transfer: FolderSync,
  db_export: DatabaseZap,
  db_import: Database,
  tippecanoe: Map,
  s3_upload: CloudUpload,
};

const NODE_COLORS: Record<NodeType, string> = {
  pm2_script: "border-blue-500/50 bg-blue-500/5",
  ssh_command: "border-green-500/50 bg-green-500/5",
  scp_transfer: "border-purple-500/50 bg-purple-500/5",
  db_export: "border-orange-500/50 bg-orange-500/5",
  db_import: "border-yellow-500/50 bg-yellow-500/5",
  tippecanoe: "border-teal-500/50 bg-teal-500/5",
  s3_upload: "border-cyan-500/50 bg-cyan-500/5",
};

const STATUS_RING: Record<string, string> = {
  DRAFT: "",
  READY: "",
  RUNNING: "ring-2 ring-blue-500 animate-pulse",
  COMPLETED: "ring-2 ring-green-500",
  FAILED: "ring-2 ring-red-500",
  PAUSED: "ring-2 ring-yellow-500",
};

function AutomationNode({
  data,
  selected,
}: {
  data: Record<string, unknown>;
  selected?: boolean;
}) {
  const d = data as unknown as AutomationNodeData & { runStatus?: string };
  const nodeType = d.nodeType || "ssh_command";
  const Icon = NODE_ICONS[nodeType] || Terminal;
  const colors = NODE_COLORS[nodeType] || "border-gray-500/50 bg-gray-500/5";
  const statusRing = d.runStatus ? STATUS_RING[d.runStatus] || "" : "";

  return (
    <div
      className={`relative rounded-lg border-2 px-4 py-3 min-w-[180px] max-w-[240px] shadow-sm transition-all ${colors} ${
        selected ? "ring-2 ring-primary" : statusRing
      }`}
    >
      {/* Handle d'entrée (gauche) - pour recevoir une connexion */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-muted-foreground/50 !border-2 !border-background hover:!bg-primary !transition-colors"
      />

      <div className="flex items-center gap-2 mb-1">
        {d.runStatus === "RUNNING" && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500 shrink-0" />
        )}
        {d.runStatus === "COMPLETED" && (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        )}
        {d.runStatus === "FAILED" && (
          <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
        )}
        {!d.runStatus && <Icon className="h-4 w-4 shrink-0" />}
        <span className="text-sm font-medium truncate">
          {d.label || "Sans nom"}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        {NODE_TYPE_LABELS[nodeType]}
      </div>
      {d.estimatedDuration > 0 && (
        <div className="text-xs text-muted-foreground mt-1">
          ~{d.estimatedDuration}min
        </div>
      )}

      {/* Handle de sortie (droite) - pour créer une connexion */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-muted-foreground/50 !border-2 !border-background hover:!bg-primary !transition-colors"
      />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  automation: AutomationNode,
};

// ==========================================
// Node Config Defaults
// ==========================================

function getDefaultConfig(
  type: NodeType
): PM2Config | SSHConfig | SCPConfig | DBExportConfig | DBImportConfig | TippecanoeConfig | S3Config {
  switch (type) {
    case "pm2_script":
      return { scriptFile: "", pm2Name: "", npmCommand: "" };
    case "ssh_command":
      return { mode: "freeform" as const, rawCommand: "" };
    case "scp_transfer":
      return { sourceVpsId: "", sourcePath: "", destVpsId: "", destPath: "" };
    case "db_export":
      return { dockerContainer: "", query: "", outputFile: "" };
    case "db_import":
      return { scriptPath: "", variables: [] };
    case "tippecanoe":
      return { inputFile: "", outputDir: "", outputName: "", minZoom: 14, maxZoom: 22, dropRate: 0, flags: ["--no-feature-limit", "--no-tile-size-limit", "--no-simplification", "--extend-zooms-if-still-dropping"] };
    case "s3_upload":
      return { files: [], bucket: "", endpoint: "", profile: "", prefix: "" };
  }
}

// ==========================================
// Palette Items
// ==========================================

const PALETTE_ITEMS: { type: NodeType; label: string; icon: typeof Terminal }[] = [
  { type: "pm2_script", label: "PM2 Script", icon: Play },
  { type: "ssh_command", label: "SSH Command", icon: Terminal },
  { type: "scp_transfer", label: "SCP Transfer", icon: FolderSync },
  { type: "db_export", label: "DB Export", icon: DatabaseZap },
  { type: "db_import", label: "DB Import", icon: Database },
  { type: "tippecanoe", label: "Tippecanoe", icon: Map },
  { type: "s3_upload", label: "S3/R2 Upload", icon: CloudUpload },
];

// ==========================================
// Main Page Component
// ==========================================

function AutomationCanvasInner() {
  const params = useParams();
  const router = useRouter();
  const automationId = params.id as string;

  const [automation, setAutomation] = useState<Automation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);

  // Selected node for config panel
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Panels
  const [activePanel, setActivePanel] = useState<"none" | "vps" | "env" | "envEditor" | "logs" | "addVps">("none");

  // Node panel tab (config vs logs)
  const [nodeTab, setNodeTab] = useState<"config" | "logs">("config");

  // VPS
  const [availableVps, setAvailableVps] = useState<
    { id: string; name: string; host: string; username: string; agentPort: number; port: number }[]
  >([]);
  const [vpsForm, setVpsForm] = useState({ vpsId: "", label: "", rootPath: "", envPath: "" });
  const [addingVps, setAddingVps] = useState(false);
  const [verifyResults, setVerifyResults] = useState<Record<string, { online: boolean; rootPath: { exists: boolean; isDirectory: boolean; isEmpty?: boolean } | null; envPath: { exists: boolean } | null } | null>>({});
  const [verifying, setVerifying] = useState<string | null>(null);

  // .env editor
  const [envContent, setEnvContent] = useState("");
  const [envVpsId, setEnvVpsId] = useState<string | null>(null);
  const [envLoading, setEnvLoading] = useState(false);
  const [envSaving, setEnvSaving] = useState(false);


  // Canvas interaction lock
  const [canvasLocked, setCanvasLocked] = useState(false);

  // Execution
  const [currentRun, setCurrentRun] = useState<AutomationRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedNodeLogs, setSelectedNodeLogs] = useState<string[]>([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ---- Fetch automation ----
  const fetchAutomation = useCallback(async () => {
    try {
      const res = await fetch(`/api/automations/${automationId}`);
      const data = await res.json();
      if (data.success) {
        setAutomation(data.data);
        // Only set nodes/edges if not running (to not overwrite run status overlays)
        if (!isRunning) {
          setNodes(data.data.nodes || []);
          setEdges(data.data.edges || []);
        }
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, [automationId, setNodes, setEdges, isRunning]);

  // ---- Fetch VPS ----
  const fetchVps = useCallback(async () => {
    try {
      const res = await fetch("/api/vps");
      const data = await res.json();
      if (data.success) {
        setAvailableVps(
          data.data.map((v: { id: string; name: string; host: string; username: string; agentPort: number; port: number }) => ({
            id: v.id,
            name: v.name,
            host: v.host,
            username: v.username,
            agentPort: v.agentPort,
            port: v.port,
          }))
        );
      }
    } catch (error) {
      console.error("Error:", error);
    }
  }, []);

  useEffect(() => {
    fetchAutomation();
    fetchVps();
  }, [fetchAutomation, fetchVps]);

  // ---- Polling for run status ----
  const startPolling = useCallback(
    (runId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);

      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(
            `/api/automations/${automationId}/run/${runId}`
          );
          const data = await res.json();
          if (data.success) {
            const run = data.data as AutomationRun;
            setCurrentRun(run);

            // Update node visual states
            const states = (run.nodeStates || {}) as Record<string, NodeState>;
            setNodes((nds: Node[]) =>
              nds.map((n) => ({
                ...n,
                data: {
                  ...n.data,
                  runStatus: states[n.id]?.status || "DRAFT",
                },
              }))
            );

            // Update selected node logs
            if (selectedNodeId && run.nodeLogs) {
              const logs = (run.nodeLogs as Record<string, string[]>)[selectedNodeId];
              if (logs) setSelectedNodeLogs(logs);
            }

            // Stop polling if run is done
            if (["COMPLETED", "FAILED"].includes(run.status)) {
              setIsRunning(false);
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              // Refresh automation
              fetchAutomation();
            }
          }
        } catch (error) {
          console.error("Poll error:", error);
        }
      }, 15000); // Poll toutes les 15s — synchronisé avec le flush backend
    },
    [automationId, selectedNodeId, setNodes, fetchAutomation]
  );

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ---- Save ----
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/automations/${automationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes, edges }),
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        alert("Erreur lors de la sauvegarde");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setSaving(false);
    }
  };

  // ---- Run ----
  const handleRun = async (fromNodeId?: string) => {
    // Save first
    await handleSave();

    try {
      const res = await fetch(`/api/automations/${automationId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromNodeId }),
      });
      const data = await res.json();
      if (data.success) {
        setIsRunning(true);
        setCurrentRun(data.data);
        startPolling(data.data.id);
      } else {
        alert(data.error || "Erreur au lancement");
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  // ---- Stop ----
  const handleStop = async () => {
    if (!currentRun) return;
    try {
      await fetch(
        `/api/automations/${automationId}/run/${currentRun.id}`,
        { method: "DELETE" }
      );
      setIsRunning(false);
      if (pollRef.current) clearInterval(pollRef.current);
      fetchAutomation();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  // ---- Connect edges ----
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds: Edge[]) =>
        addEdge(
          {
            ...connection,
            animated: true,
            style: { stroke: "#6366f1", strokeWidth: 2 },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  // ---- Select node ----
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
      setActivePanel("none");

      // If running, show logs for this node
      if (currentRun && currentRun.nodeLogs) {
        const logs = (currentRun.nodeLogs as Record<string, string[]>)[node.id];
        if (logs) setSelectedNodeLogs(logs);
        else setSelectedNodeLogs([]);
      }
    },
    [currentRun]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // ---- Add node ----
  const handleAddNode = (type: NodeType) => {
    const newNode: Node = {
      id: `node-${Date.now()}`,
      type: "automation",
      position: { x: 250 + Math.random() * 200, y: 100 + nodes.length * 120 },
      data: {
        label: `${NODE_TYPE_LABELS[type]}`,
        vpsId: "",
        estimatedDuration: 0,
        notes: "",
        nodeType: type,
        config: getDefaultConfig(type),
      } satisfies AutomationNodeData,
    };
    setNodes((nds: Node[]) => [...nds, newNode]);
    setSelectedNodeId(newNode.id);
    setActivePanel("none");
  };

  // ---- Delete node ----
  const handleDeleteNode = (nodeId: string) => {
    setNodes((nds: Node[]) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds: Edge[]) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
  };

  // ---- Update node data ----
  const updateNodeData = (nodeId: string, newData: Partial<AutomationNodeData>) => {
    setNodes((nds: Node[]) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...newData } } : n))
    );
  };

  // ---- VPS Management ----
  const handleAddVps = async () => {
    if (!vpsForm.vpsId || !vpsForm.label || !vpsForm.rootPath) {
      alert("VPS, label et chemin racine sont requis");
      return;
    }
    setAddingVps(true);
    try {
      const res = await fetch(`/api/automations/${automationId}/vps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vpsForm),
      });
      const data = await res.json();
      if (data.success) {
        await fetchAutomation();
        setVpsForm({ vpsId: "", label: "", rootPath: "", envPath: "" });
        setActivePanel("vps");
      } else {
        alert(data.error || "Erreur");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setAddingVps(false);
    }
  };

  const handleRemoveVps = async (wvId: string) => {
    if (!confirm("Retirer ce VPS du workflow ?")) return;
    try {
      await fetch(`/api/automations/${automationId}/vps/${wvId}`, {
        method: "DELETE",
      });
      fetchAutomation();
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleVerifyVps = async (wvId: string) => {
    setVerifying(wvId);
    try {
      const res = await fetch(
        `/api/automations/${automationId}/vps/${wvId}/verify`,
        { method: "POST" }
      );
      const data = await res.json();
      if (data.success) {
        setVerifyResults((prev) => ({ ...prev, [wvId]: data.data }));
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setVerifying(null);
    }
  };

  // ---- .env Editor ----
  const openEnvEditor = async (wvId: string) => {
    setEnvVpsId(wvId);
    setEnvLoading(true);
    setActivePanel("envEditor");
    try {
      const res = await fetch(
        `/api/automations/${automationId}/vps/${wvId}/env`
      );
      const data = await res.json();
      if (data.success) {
        setEnvContent(data.data.content);
      } else {
        setEnvContent("# Erreur: " + (data.error || "Impossible de lire le .env"));
      }
    } catch (error) {
      setEnvContent("# Erreur de connexion");
    } finally {
      setEnvLoading(false);
    }
  };

  const saveEnvFile = async () => {
    if (!envVpsId) return;
    setEnvSaving(true);
    try {
      const res = await fetch(
        `/api/automations/${automationId}/vps/${envVpsId}/env`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: envContent }),
        }
      );
      const data = await res.json();
      if (data.success) {
        alert("Fichier .env sauvegardé sur le VPS");
      } else {
        alert(data.error || "Erreur lors de la sauvegarde");
      }
    } catch (error) {
      alert("Erreur de connexion");
    } finally {
      setEnvSaving(false);
    }
  };

  // ---- (Global vars removed — env is now centralized per VPS) ----

  // ---- Selected node ----
  const selectedNode = nodes.find((n: Node) => n.id === selectedNodeId);

  // ---- Node run state for selected node ----
  const selectedNodeState: NodeState | null =
    currentRun && selectedNodeId
      ? ((currentRun.nodeStates as Record<string, NodeState>)?.[selectedNodeId] || null)
      : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-120px)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!automation) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Automatisation introuvable</h2>
        <Button variant="outline" onClick={() => router.push("/dashboard/automations")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
      </div>
    );
  }

  const showRightPanel = selectedNode || activePanel !== "none";

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* ===== TOOLBAR ===== */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/automations")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-sm font-semibold">{automation.name}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{automation.category.name}</span>
              <span>&middot;</span>
              <span>{AUTOMATION_TYPE_LABELS[automation.type]}</span>
            </div>
          </div>
          <Badge variant={getStatusBadgeVariant(automation.status)} className="ml-2">
            {AUTOMATION_STATUS_LABELS[automation.status]}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={activePanel === "vps" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setActivePanel(activePanel === "vps" ? "none" : "vps");
              setSelectedNodeId(null);
            }}
          >
            <Server className="h-4 w-4 mr-1" />
            VPS ({automation.workflowVps?.length || 0})
          </Button>
          <Button
            variant={activePanel === "env" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setActivePanel(activePanel === "env" ? "none" : "env");
              setSelectedNodeId(null);
            }}
          >
            <FileText className="h-4 w-4 mr-1" />
            Env
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving || isRunning}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="h-4 w-4 mr-1 text-green-500" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            {saved ? "Sauvé !" : "Save"}
          </Button>
          {isRunning ? (
            <Button size="sm" variant="destructive" onClick={handleStop}>
              <Square className="h-4 w-4 mr-1" />
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={() => handleRun()}>
              <Play className="h-4 w-4 mr-1" />
              Exécuter
            </Button>
          )}
        </div>
      </div>

      {/* ===== MAIN AREA ===== */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left palette */}
        <div className="w-[180px] border-r bg-card p-3 space-y-1 shrink-0 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
            Noeuds
          </p>
          {PALETTE_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.type}
                onClick={() => handleAddNode(item.type)}
                className="flex items-center gap-2 w-full rounded-md px-2 py-2 text-sm hover:bg-muted transition-colors text-left"
                disabled={isRunning}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          {/* Run history */}
          {automation.runs && automation.runs.length > 0 && (
            <>
              <div className="border-t my-3" />
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
                Historique
              </p>
              {automation.runs.slice(0, 5).map((run: AutomationRun) => (
                <div
                  key={run.id}
                  className="text-xs text-muted-foreground flex items-center gap-1 py-1"
                >
                  <Circle
                    className={`h-2 w-2 shrink-0 ${
                      run.status === "COMPLETED"
                        ? "fill-green-500 text-green-500"
                        : run.status === "FAILED"
                          ? "fill-red-500 text-red-500"
                          : run.status === "RUNNING"
                            ? "fill-blue-500 text-blue-500"
                            : "fill-gray-400 text-gray-400"
                    }`}
                  />
                  <span className="truncate">{formatDate(run.startedAt)}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Canvas */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            nodesDraggable={!canvasLocked}
            nodesConnectable={!canvasLocked}
            elementsSelectable={!canvasLocked}
            fitView
            className="bg-background"
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: "#6366f1", strokeWidth: 2 },
            }}
          >
            <Background gap={20} size={1} color="#092876" />
            <CanvasControls locked={canvasLocked} onToggleLock={() => setCanvasLocked(l => !l)} />
            <MiniMap nodeStrokeWidth={3} className="!bg-card !border-border" />
            {nodes.length === 0 && (
              <Panel position="top-center">
                <div className="text-center mt-20 text-muted-foreground">
                  <p className="text-lg font-medium mb-2">Canvas vide</p>
                  <p className="text-sm">
                    Cliquez sur un noeud dans la palette pour commencer
                  </p>
                </div>
              </Panel>
            )}
          </ReactFlow>
        </div>

        {/* ===== RIGHT PANEL ===== */}
        {showRightPanel && (
          <div className="w-[380px] border-l bg-card overflow-y-auto shrink-0">
            {/* ---- Node Panel with Tabs (Config / Logs) ---- */}
            {selectedNode && activePanel === "none" && (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="p-4 pb-0 flex items-center justify-between">
                  <h3 className="font-semibold text-sm truncate">{getNodeData(selectedNode).label || "Sans nom"}</h3>
                  <div className="flex items-center gap-1 shrink-0">
                    {!isRunning && selectedNodeState?.status === "FAILED" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-blue-500"
                        title="Relancer depuis ce noeud"
                        onClick={() => handleRun(selectedNode.id)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-500"
                      onClick={() => handleDeleteNode(selectedNode.id)}
                      disabled={isRunning}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setSelectedNodeId(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Run status banner */}
                {selectedNodeState && (
                  <div className="px-4 pt-2">
                    <div
                      className={`text-xs rounded-md p-2 ${
                        selectedNodeState.status === "COMPLETED"
                          ? "bg-green-500/10 text-green-500"
                          : selectedNodeState.status === "FAILED"
                            ? "bg-red-500/10 text-red-500"
                            : selectedNodeState.status === "RUNNING"
                              ? "bg-blue-500/10 text-blue-500"
                              : "bg-muted text-muted-foreground"
                      }`}
                    >
                      Status: {AUTOMATION_STATUS_LABELS[selectedNodeState.status] || selectedNodeState.status}
                      {selectedNodeState.error && (
                        <p className="mt-1 font-mono text-xs opacity-80">{selectedNodeState.error}</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab switcher */}
                <div className="px-4 pt-3 flex gap-1 border-b">
                  <button
                    onClick={() => setNodeTab("config")}
                    className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                      nodeTab === "config"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Pencil className="h-3 w-3 inline mr-1.5 -mt-0.5" />
                    Configuration
                  </button>
                  <button
                    onClick={() => setNodeTab("logs")}
                    className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                      nodeTab === "logs"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Terminal className="h-3 w-3" />
                    Logs
                    {selectedNodeLogs.length > 0 && (
                      <span className="bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px] leading-none">
                        {selectedNodeLogs.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto">
                  {/* ===== CONFIG TAB ===== */}
                  {nodeTab === "config" && (
                    <div className="p-4 space-y-4">
                      {/* Label */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Nom</Label>
                        <Input
                          value={getNodeData(selectedNode).label}
                          onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                          className="h-8 text-sm"
                        />
                      </div>

                      {/* Type */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Type</Label>
                        <div className="flex items-center gap-2 h-8 px-3 rounded-md border bg-muted/50 text-sm">
                          {NODE_TYPE_LABELS[getNodeData(selectedNode).nodeType]}
                        </div>
                      </div>

                      {/* VPS cible */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">VPS cible</Label>
                        <select
                          value={getNodeData(selectedNode).vpsId || ""}
                          onChange={(e) => updateNodeData(selectedNode.id, { vpsId: e.target.value })}
                          className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">Sélectionner un VPS...</option>
                          {(automation.workflowVps || []).map((wv: AutomationVps) => (
                            <option key={wv.id} value={wv.id}>
                              {wv.label} ({wv.vps.name})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Durée */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Durée estimée (min)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={getNodeData(selectedNode).estimatedDuration || 0}
                          onChange={(e) =>
                            updateNodeData(selectedNode.id, {
                              estimatedDuration: parseInt(e.target.value) || 0,
                            })
                          }
                          className="h-8 text-sm"
                        />
                      </div>

                      {/* Type-specific config */}
                      <NodeTypeConfig
                        node={selectedNode}
                        updateNodeData={updateNodeData}
                        automation={automation}
                      />

                      {/* Notes */}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Notes</Label>
                        <textarea
                          value={getNodeData(selectedNode).notes || ""}
                          onChange={(e) => updateNodeData(selectedNode.id, { notes: e.target.value })}
                          className="w-full min-h-[50px] rounded-md border border-input bg-background px-3 py-2 text-xs resize-y"
                          rows={2}
                        />
                      </div>
                    </div>
                  )}

                  {/* ===== LOGS TAB ===== */}
                  {nodeTab === "logs" && (
                    <div className="flex flex-col h-full">
                      {/* Logs toolbar */}
                      <div className="px-4 py-2 flex items-center justify-between border-b">
                        <span className="text-xs text-muted-foreground">
                          {selectedNodeLogs.length} lignes
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={() => setSelectedNodeLogs([])}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Effacer
                          </Button>
                        </div>
                      </div>

                      {/* Logs content */}
                      <div
                        className="flex-1 overflow-y-auto bg-gray-950 p-3 font-mono text-xs"
                        ref={(el) => {
                          if (el) el.scrollTop = el.scrollHeight;
                        }}
                      >
                        {selectedNodeLogs.length === 0 ? (
                          <div className="text-gray-500 text-center py-12">
                            <Terminal className="h-8 w-8 mx-auto mb-3 opacity-30" />
                            <p>En attente des logs...</p>
                            <p className="text-[10px] mt-1 opacity-50">Les logs apparaîtront ici lors de l&apos;exécution</p>
                          </div>
                        ) : (
                          selectedNodeLogs.map((line, i) => {
                            const lower = line.toLowerCase();
                            let color = "text-gray-300";
                            if (lower.includes("[error]") || lower.includes("[pm2:err]") || lower.includes(":err]") || lower.includes("✗")) {
                              color = "text-red-400";
                            } else if (lower.includes("[done]") || lower.includes("succès") || lower.includes("terminé") || lower.includes("✓")) {
                              color = "text-green-400";
                            } else if (lower.includes("[env]") || lower.includes("warn")) {
                              color = "text-yellow-400";
                            } else if (lower.includes("[pm2] ⏳") || lower.includes("en cours")) {
                              color = "text-blue-400";
                            } else if (lower.includes("[start]") || lower.includes("démarrage") || lower.includes("socket")) {
                              color = "text-cyan-400";
                            } else if (lower.includes("[skip]")) {
                              color = "text-gray-500";
                            }

                            return (
                              <div
                                key={i}
                                className={`${color} hover:bg-gray-900/50 px-1 -mx-1 rounded leading-5`}
                              >
                                {line}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ---- VPS Panel ---- */}
            {activePanel === "vps" && (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">VPS du workflow</h3>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setActivePanel("addVps")}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Ajouter
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setActivePanel("none")}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {(automation.workflowVps || []).length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-xs">Aucun VPS configuré</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => setActivePanel("addVps")}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Ajouter un VPS
                    </Button>
                  </div>
                ) : (
                  (automation.workflowVps || []).map((wv: AutomationVps) => {
                    const vr = verifyResults[wv.id];
                    return (
                      <Card key={wv.id} className="border">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{wv.label}</span>
                            <div className="flex items-center gap-1">
                              <Badge variant="secondary" className="text-xs">
                                {wv.vps.name}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-red-500"
                                onClick={() => handleRemoveVps(wv.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {wv.vps.username}@{wv.vps.host}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <FolderOpen className="h-3 w-3" />
                            {wv.rootPath}
                            {vr?.rootPath && (
                              vr.rootPath.exists ? (
                                <CheckCircle2 className="h-3 w-3 text-green-500 ml-1" />
                              ) : (
                                <AlertCircle className="h-3 w-3 text-red-500 ml-1" />
                              )
                            )}
                          </div>
                          {wv.envPath && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              {wv.envPath}
                              {vr?.envPath && (
                                vr.envPath.exists ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-500 ml-1" />
                                ) : (
                                  <AlertCircle className="h-3 w-3 text-red-500 ml-1" />
                                )
                              )}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-1 pt-1 border-t">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => handleVerifyVps(wv.id)}
                              disabled={verifying === wv.id}
                            >
                              {verifying === wv.id ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3 mr-1" />
                              )}
                              Vérifier
                            </Button>
                            {wv.envPath && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs"
                                onClick={() => openEnvEditor(wv.id)}
                              >
                                <Pencil className="h-3 w-3 mr-1" />
                                .env
                              </Button>
                            )}
                          </div>

                          {/* Verify results */}
                          {vr && (
                            <div className={`text-xs rounded p-2 ${vr.online ? "bg-green-500/10" : "bg-red-500/10"}`}>
                              {vr.online ? "VPS en ligne" : "VPS hors ligne"}
                              {vr.rootPath && !vr.rootPath.exists && (
                                <p className="text-red-600">Chemin racine introuvable</p>
                              )}
                              {vr.rootPath && vr.rootPath.exists && vr.rootPath.isEmpty && (
                                <p className="text-yellow-600">Répertoire vide</p>
                              )}
                              {vr.envPath && !vr.envPath.exists && (
                                <p className="text-red-600">Fichier .env introuvable</p>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            )}

            {/* ---- Add VPS Form ---- */}
            {activePanel === "addVps" && (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Ajouter un VPS</h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setActivePanel("vps")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">VPS *</Label>
                  <select
                    value={vpsForm.vpsId}
                    onChange={(e) => setVpsForm({ ...vpsForm, vpsId: e.target.value })}
                    className="w-full h-8 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Sélectionner...</option>
                    {availableVps.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.username}@{v.host})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Label *</Label>
                  <Input
                    value={vpsForm.label}
                    onChange={(e) => setVpsForm({ ...vpsForm, label: e.target.value })}
                    placeholder="Ex: VPS TRAITEMENT"
                    className="h-8 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Chemin racine projet *</Label>
                  <Input
                    value={vpsForm.rootPath}
                    onChange={(e) => setVpsForm({ ...vpsForm, rootPath: e.target.value })}
                    placeholder="/home/user/project/CODE"
                    className="h-8 text-sm font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Chemin .env (optionnel)</Label>
                  <Input
                    value={vpsForm.envPath}
                    onChange={(e) => setVpsForm({ ...vpsForm, envPath: e.target.value })}
                    placeholder="/home/user/project/CODE/.env"
                    className="h-8 text-sm font-mono"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setActivePanel("vps")}>
                    Annuler
                  </Button>
                  <Button size="sm" onClick={handleAddVps} disabled={addingVps}>
                    {addingVps && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    Ajouter
                  </Button>
                </div>
              </div>
            )}

            {/* ---- .env Editor ---- */}
            {activePanel === "envEditor" && (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Éditeur .env</h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setActivePanel("env")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Show which VPS this env belongs to */}
                {envVpsId && automation.workflowVps && (
                  <div className="text-xs text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1">
                    {automation.workflowVps.find((wv: AutomationVps) => wv.id === envVpsId)?.envPath || ""}
                  </div>
                )}

                {envLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <>
                    <textarea
                      value={envContent}
                      onChange={(e) => setEnvContent(e.target.value)}
                      className="w-full min-h-[300px] rounded-md border border-input bg-black text-green-400 px-3 py-2 text-xs font-mono resize-y"
                      spellCheck={false}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setActivePanel("env")}>
                        Retour
                      </Button>
                      <Button size="sm" onClick={saveEnvFile} disabled={envSaving}>
                        {envSaving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        Sauvegarder sur le VPS
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ---- Env Files Panel ---- */}
            {activePanel === "env" && (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Variables d&apos;environnement</h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setActivePanel("none")}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fichiers .env de chaque VPS du workflow. Cliquez pour lire/modifier.
                </p>

                {(!automation.workflowVps || automation.workflowVps.length === 0) ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Aucun VPS ajouté. Ajoutez un VPS au workflow pour gérer ses variables d&apos;environnement.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {automation.workflowVps.map((wv: AutomationVps) => (
                      <div
                        key={wv.id}
                        className="border rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Server className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium">{wv.label}</span>
                          </div>
                          {wv.envPath ? (
                            <Badge variant="outline" className="text-[10px]">
                              .env
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">
                              Pas de .env
                            </Badge>
                          )}
                        </div>

                        {wv.envPath ? (
                          <>
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {wv.envPath}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-xs"
                              onClick={() => openEnvEditor(wv.id)}
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              Ouvrir et modifier
                            </Button>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">
                            Aucun fichier .env configuré pour ce VPS.
                            Modifiez le VPS dans l&apos;onglet VPS pour ajouter un chemin .env.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// Type-specific config forms
// ==========================================

function NodeTypeConfig({
  node,
  updateNodeData,
  automation,
}: {
  node: Node;
  updateNodeData: (id: string, data: Partial<AutomationNodeData>) => void;
  automation: Automation;
}) {
  const data = node.data as unknown as AutomationNodeData;
  const config = data.config;
  const nodeType = data.nodeType;

  const updateConfig = (partial: Record<string, unknown>) => {
    updateNodeData(node.id, {
      config: {
        ...(config as unknown as Record<string, unknown>),
        ...partial,
      } as unknown as AutomationNodeData["config"],
    } as Partial<AutomationNodeData>);
  };

  switch (nodeType) {
    case "pm2_script": {
      const c = config as PM2Config;
      return (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground">Config PM2</p>
          <div className="space-y-1.5">
            <Label className="text-xs">Fichier script</Label>
            <Input value={c.scriptFile || ""} onChange={(e) => updateConfig({ scriptFile: e.target.value })} placeholder="etape1-download.js" className="h-7 text-xs font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nom PM2</Label>
            <Input value={c.pm2Name || ""} onChange={(e) => updateConfig({ pm2Name: e.target.value })} placeholder="permis-download" className="h-7 text-xs font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Commande npm</Label>
            <Input value={c.npmCommand || ""} onChange={(e) => updateConfig({ npmCommand: e.target.value })} placeholder="download" className="h-7 text-xs font-mono" />
          </div>
          <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 font-mono">
            pm2 start npm --name &quot;{c.pm2Name || "..."}&quot; --no-autorestart -- run {c.npmCommand || "..."}
          </div>
        </div>
      );
    }

    case "ssh_command": {
      const c = config as SSHConfig;
      return (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground">Config SSH</p>
          <div className="flex items-center gap-2">
            <button className={`text-xs px-2 py-1 rounded ${c.mode === "structured" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`} onClick={() => updateConfig({ mode: "structured" })}>
              Structuré
            </button>
            <button className={`text-xs px-2 py-1 rounded ${c.mode === "freeform" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`} onClick={() => updateConfig({ mode: "freeform" })}>
              Libre
            </button>
          </div>
          {c.mode === "structured" ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Container Docker</Label>
                <Input value={c.dockerContainer || ""} onChange={(e) => updateConfig({ dockerContainer: e.target.value })} placeholder="clickhouse_genealogie" className="h-7 text-xs font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Commande Docker</Label>
                <Input value={c.dockerCommand || ""} onChange={(e) => updateConfig({ dockerCommand: e.target.value })} placeholder="clickhouse client" className="h-7 text-xs font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Query</Label>
                <textarea value={c.query || ""} onChange={(e) => updateConfig({ query: e.target.value })} placeholder="SELECT * FROM..." className="w-full min-h-[50px] rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-y" rows={2} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fichier output</Label>
                <Input value={c.outputFile || ""} onChange={(e) => updateConfig({ outputFile: e.target.value })} placeholder="export/file.csv" className="h-7 text-xs font-mono" />
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Commande</Label>
              <textarea value={c.rawCommand || ""} onChange={(e) => updateConfig({ rawCommand: e.target.value })} placeholder="docker exec -it ..." className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-y" rows={4} />
            </div>
          )}
        </div>
      );
    }

    case "scp_transfer": {
      const c = config as SCPConfig;
      return (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground">Config SCP</p>
          <div className="space-y-1.5">
            <Label className="text-xs">VPS source</Label>
            <select value={c.sourceVpsId || ""} onChange={(e) => updateConfig({ sourceVpsId: e.target.value })} className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Sélectionner...</option>
              {(automation.workflowVps || []).map((wv: AutomationVps) => (<option key={wv.id} value={wv.id}>{wv.label}</option>))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Chemin source</Label>
            <Input value={c.sourcePath || ""} onChange={(e) => updateConfig({ sourcePath: e.target.value })} placeholder="export/file.csv" className="h-7 text-xs font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">VPS destination</Label>
            <select value={c.destVpsId || ""} onChange={(e) => updateConfig({ destVpsId: e.target.value })} className="w-full h-7 rounded-md border border-input bg-background px-2 text-xs">
              <option value="">Sélectionner...</option>
              {(automation.workflowVps || []).map((wv: AutomationVps) => (<option key={wv.id} value={wv.id}>{wv.label}</option>))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Chemin destination</Label>
            <Input value={c.destPath || ""} onChange={(e) => updateConfig({ destPath: e.target.value })} placeholder="/home/user/data/" className="h-7 text-xs font-mono" />
          </div>
        </div>
      );
    }

    case "db_export": {
      const c = config as DBExportConfig;
      return (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground">Config DB Export</p>
          <div className="space-y-1.5">
            <Label className="text-xs">Container Docker</Label>
            <Input value={c.dockerContainer || ""} onChange={(e) => updateConfig({ dockerContainer: e.target.value })} placeholder="clickhouse_genealogie" className="h-7 text-xs font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Query SQL</Label>
            <textarea value={c.query || ""} onChange={(e) => updateConfig({ query: e.target.value })} placeholder="SELECT * FROM..." className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-y" rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fichier output</Label>
            <Input value={c.outputFile || ""} onChange={(e) => updateConfig({ outputFile: e.target.value })} placeholder="export/table.csv" className="h-7 text-xs font-mono" />
          </div>
        </div>
      );
    }

    case "db_import": {
      const c = config as DBImportConfig;
      return (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground">Config DB Import</p>
          <div className="space-y-1.5">
            <Label className="text-xs">Script bash</Label>
            <Input value={c.scriptPath || ""} onChange={(e) => updateConfig({ scriptPath: e.target.value })} placeholder="./init.sh" className="h-7 text-xs font-mono" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Variables</Label>
              <button className="text-xs text-primary hover:underline" onClick={() => updateConfig({ variables: [...(c.variables || []), { key: "", value: "" }] })}>+ Ajouter</button>
            </div>
            {(c.variables || []).map((v: { key: string; value: string }, i: number) => (
              <div key={i} className="flex items-center gap-1">
                <Input value={v.key} onChange={(e) => { const vars = [...(c.variables || [])]; vars[i] = { ...vars[i], key: e.target.value }; updateConfig({ variables: vars }); }} placeholder="DB_NAME" className="h-7 text-xs font-mono flex-1" />
                <Input value={v.value} onChange={(e) => { const vars = [...(c.variables || [])]; vars[i] = { ...vars[i], value: e.target.value }; updateConfig({ variables: vars }); }} placeholder="permis" className="h-7 text-xs font-mono flex-1" />
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => updateConfig({ variables: (c.variables || []).filter((_: { key: string; value: string }, idx: number) => idx !== i) })}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "tippecanoe": {
      const c = config as TippecanoeConfig;
      return (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground">Config Tippecanoe</p>
          <div className="space-y-1.5">
            <Label className="text-xs">Fichier GeoJSON (chemin)</Label>
            <Input value={c.inputFile || ""} onChange={(e) => updateConfig({ inputFile: e.target.value })} placeholder="/data/pc.geojson" className="h-7 text-xs font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Répertoire de sortie</Label>
            <Input value={c.outputDir || ""} onChange={(e) => updateConfig({ outputDir: e.target.value })} placeholder="(défaut: rootPath du VPS)" className="h-7 text-xs font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Nom fichier final (.pmtiles)</Label>
            <Input value={c.outputName || ""} onChange={(e) => updateConfig({ outputName: e.target.value })} placeholder="(défaut: même nom que le geojson)" className="h-7 text-xs font-mono" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Zoom min</Label>
              <Input type="number" value={c.minZoom ?? 14} onChange={(e) => updateConfig({ minZoom: parseInt(e.target.value) || 0 })} className="h-7 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Zoom max</Label>
              <Input type="number" value={c.maxZoom ?? 22} onChange={(e) => updateConfig({ maxZoom: parseInt(e.target.value) || 0 })} className="h-7 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Drop rate</Label>
              <Input type="number" value={c.dropRate ?? 0} onChange={(e) => updateConfig({ dropRate: parseFloat(e.target.value) || 0 })} className="h-7 text-xs" step="0.1" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Flags</Label>
            <textarea value={(c.flags || []).join("\n")} onChange={(e) => updateConfig({ flags: e.target.value.split("\n").filter((f: string) => f.trim()) })} placeholder={"--no-feature-limit\n--no-tile-size-limit\n--no-simplification\n--extend-zooms-if-still-dropping"} className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-y" rows={4} />
            <p className="text-[10px] text-muted-foreground">Un flag par ligne</p>
          </div>
        </div>
      );
    }

    case "s3_upload": {
      const c = config as S3Config;
      return (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-semibold text-muted-foreground">Config S3/R2</p>
          <div className="space-y-1.5">
            <Label className="text-xs">Bucket</Label>
            <Input value={c.bucket || ""} onChange={(e) => updateConfig({ bucket: e.target.value })} placeholder="tiles-store" className="h-7 text-xs font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Endpoint</Label>
            <Input value={c.endpoint || ""} onChange={(e) => updateConfig({ endpoint: e.target.value })} placeholder="https://...r2.cloudflarestorage.com" className="h-7 text-xs font-mono" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Prefix</Label>
              <Input value={c.prefix || ""} onChange={(e) => updateConfig({ prefix: e.target.value })} placeholder="permis/" className="h-7 text-xs font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Profile</Label>
              <Input value={c.profile || ""} onChange={(e) => updateConfig({ profile: e.target.value })} placeholder="r2" className="h-7 text-xs font-mono" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Fichiers</Label>
              <button className="text-xs text-primary hover:underline" onClick={() => updateConfig({ files: [...(c.files || []), { source: "", destKey: "" }] })}>+ Ajouter</button>
            </div>
            {(c.files || []).map((f: { source: string; destKey: string }, i: number) => (
              <div key={i} className="flex items-center gap-1">
                <Input value={f.source} onChange={(e) => { const files = [...(c.files || [])]; files[i] = { ...files[i], source: e.target.value }; updateConfig({ files }); }} placeholder="pa.pmtiles" className="h-7 text-xs font-mono flex-1" />
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                <Input value={f.destKey} onChange={(e) => { const files = [...(c.files || [])]; files[i] = { ...files[i], destKey: e.target.value }; updateConfig({ files }); }} placeholder="permis/pa.pmtiles" className="h-7 text-xs font-mono flex-1" />
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => updateConfig({ files: (c.files || []).filter((_: { source: string; destKey: string }, idx: number) => idx !== i) })}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

// ==========================================
// Wrap with Provider
// ==========================================

export default function AutomationCanvasPage() {
  return (
    <ReactFlowProvider>
      <AutomationCanvasInner />
    </ReactFlowProvider>
  );
}
