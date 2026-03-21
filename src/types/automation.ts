// ==========================================
// Types Automatisations
// ==========================================

export type AutomationType = "MENSUELLE" | "ANNUELLE" | "TRIMESTRIELLE" | "SEMESTRIELLE";
export type AutomationStatus = "DRAFT" | "READY" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED";

export type NodeType =
  | "pm2_script"
  | "ssh_command"
  | "scp_transfer"
  | "db_export"
  | "db_import"
  | "tippecanoe"
  | "s3_upload";

// ---- Node Configs ----

export interface PM2Config {
  scriptFile: string;
  pm2Name: string;
  npmCommand: string;
}

export interface SSHConfig {
  mode: "structured" | "freeform";
  dockerContainer?: string;
  dockerCommand?: string;
  query?: string;
  outputFile?: string;
  rawCommand?: string;
}

export interface SCPConfig {
  sourceVpsId: string;
  sourcePath: string;
  destVpsId: string;
  destPath: string;
}

export interface DBExportConfig {
  dockerContainer: string;
  query: string;
  outputFile: string;
}

export interface DBImportConfig {
  scriptPath: string;
  variables: { key: string; value: string }[];
}

export interface TippecanoeConfig {
  inputFiles: string[];
  minZoom: number;
  maxZoom: number;
  extraFlags: string[];
}

export interface S3Config {
  files: { source: string; destKey: string }[];
  bucket: string;
  endpoint: string;
  profile: string;
  prefix: string;
}

export type NodeConfig =
  | PM2Config
  | SSHConfig
  | SCPConfig
  | DBExportConfig
  | DBImportConfig
  | TippecanoeConfig
  | S3Config;

// ---- Automation Node (stored in JSON) ----

export interface AutomationNodeData {
  label: string;
  vpsId: string;
  estimatedDuration: number;
  notes: string;
  nodeType: NodeType;
  config: NodeConfig;
  envVars: { key: string; value: string }[];
}

// ---- Global Variable ----

export interface GlobalVar {
  key: string;
  value: string;
}

// ---- Category ----

export interface AutomationCategory {
  id: string;
  name: string;
  _count?: { automations: number };
}

// ---- Workflow VPS ----

export interface AutomationVps {
  id: string;
  automationId: string;
  vpsId: string;
  label: string;
  rootPath: string;
  envPath: string | null;
  vps: {
    id: string;
    name: string;
    host: string;
    port: number;
    agentPort: number;
    username: string;
  };
}

// ---- Run ----

export interface NodeState {
  status: AutomationStatus;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  status: AutomationStatus;
  startedAt: string;
  finishedAt: string | null;
  nodeStates: Record<string, NodeState>;
  nodeLogs: Record<string, string[]>;
  triggeredBy?: { name: string; email: string };
}

// ---- Full Automation ----

export interface Automation {
  id: string;
  name: string;
  type: AutomationType;
  description: string | null;
  source: string | null;
  releaseDate: string | null;
  status: AutomationStatus;
  categoryId: string;
  category: AutomationCategory;
  userId: string;
  createdBy?: { name: string; email: string };
  nodes: unknown[];
  edges: unknown[];
  globalVars: GlobalVar[];
  workflowVps: AutomationVps[];
  runs: AutomationRun[];
  createdAt: string;
  updatedAt: string;
}

// ---- Create/Update DTOs ----

export interface CreateAutomationDto {
  name: string;
  type: AutomationType;
  description?: string;
  source?: string;
  releaseDate?: string;
  categoryId?: string;
  categoryName?: string; // if creating a new category
}

export interface UpdateAutomationDto {
  name?: string;
  type?: AutomationType;
  description?: string;
  source?: string;
  releaseDate?: string;
  status?: AutomationStatus;
  nodes?: unknown[];
  edges?: unknown[];
  globalVars?: GlobalVar[];
}

// ---- Node Type Labels ----

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  pm2_script: "PM2 Script",
  ssh_command: "SSH Command",
  scp_transfer: "SCP Transfer",
  db_export: "DB Export",
  db_import: "DB Import",
  tippecanoe: "Tippecanoe",
  s3_upload: "S3/R2 Upload",
};

export const NODE_TYPE_ICONS: Record<NodeType, string> = {
  pm2_script: "Play",
  ssh_command: "Terminal",
  scp_transfer: "FolderSync",
  db_export: "DatabaseZap",
  db_import: "DatabaseBackup",
  tippecanoe: "Map",
  s3_upload: "CloudUpload",
};

export const AUTOMATION_TYPE_LABELS: Record<AutomationType, string> = {
  MENSUELLE: "Mensuelle",
  ANNUELLE: "Annuelle",
  TRIMESTRIELLE: "Trimestrielle",
  SEMESTRIELLE: "Semestrielle",
};

export const AUTOMATION_STATUS_LABELS: Record<AutomationStatus, string> = {
  DRAFT: "Brouillon",
  READY: "Prêt",
  RUNNING: "En cours",
  PAUSED: "En pause",
  COMPLETED: "Terminé",
  FAILED: "Échoué",
};
