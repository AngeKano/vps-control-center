# Documentation Automatisation - VPS Control Center

## Table des matieres

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture](#2-architecture)
3. [Modele de donnees](#3-modele-de-donnees)
4. [Types de noeuds](#4-types-de-noeuds)
5. [Moteur d'execution (Engine)](#5-moteur-dexecution-engine)
6. [Strategies d'execution des commandes](#6-strategies-dexecution-des-commandes)
7. [Gestion du graphe (DAG)](#7-gestion-du-graphe-dag)
8. [Variables globales](#8-variables-globales)
9. [API REST](#9-api-rest)
10. [Interface utilisateur (Canvas)](#10-interface-utilisateur-canvas)
11. [Gestion des erreurs](#11-gestion-des-erreurs)
12. [Timeouts et limites](#12-timeouts-et-limites)
13. [Fichiers cles](#13-fichiers-cles)

---

## 1. Vue d'ensemble

Le module Automatisation permet de concevoir, executer et surveiller des workflows multi-etapes sur des serveurs VPS distants. Chaque workflow est un **graphe acyclique dirige (DAG)** ou :

- Les **noeuds** representent des taches (scripts PM2, commandes SSH, transferts SCP, exports/imports DB, generation de tuiles, uploads S3)
- Les **liens (edges)** definissent les dependances d'execution (A -> B signifie "B attend que A soit termine")

Les workflows sont edites visuellement via un canvas React Flow, executes par un moteur DAG cote serveur, et les logs sont suivis en temps reel via Socket.IO.

---

## 2. Architecture

```
┌───────────────────────────────────────────────────────┐
│                   FRONTEND (React)                     │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Canvas       │  │ Panneau      │  │ Historique   │ │
│  │ React Flow   │  │ Config Noeud │  │ des Runs     │ │
│  │ (drag&drop)  │  │ (formulaire) │  │ (logs)       │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                 │         │
│         └────────┬────────┘                 │         │
│                  │ save (PUT)                │ poll    │
└──────────────────┼──────────────────────────┼─────────┘
                   │                          │
┌──────────────────▼──────────────────────────▼─────────┐
│                   BACKEND (Next.js API)                │
│                                                       │
│  ┌────────────────┐  ┌─────────────────────────────┐  │
│  │ API Routes     │  │ Automation Engine            │  │
│  │ /automations/* │  │                             │  │
│  │                │  │  ┌────────┐  ┌───────────┐  │  │
│  │ CRUD + Run     │──▶│  DAG    │  │ Executors │  │  │
│  │                │  │  │ (Kahn) │  │ (7 types) │  │  │
│  └────────────────┘  │  └────────┘  └─────┬─────┘  │  │
│                      │                    │        │  │
│                      └────────────────────┼────────┘  │
│                                           │           │
│  ┌───────────┐                            │           │
│  │ Prisma    │◀── nodeStates/nodeLogs ────┘           │
│  │ PostgreSQL│                                        │
│  └───────────┘                                        │
└───────────────────────────┬───────────────────────────┘
                            │ HTTP + Socket.IO
              ┌─────────────┼─────────────┐
              │             │             │
       ┌──────▼──────┐ ┌───▼────────┐ ┌──▼──────────┐
       │   VPS 1     │ │   VPS 2    │ │   VPS 3     │
       │ agent:4000  │ │ agent:4000 │ │ agent:4000  │
       │             │ │            │ │             │
       │ - /api/exec │ │ - PM2      │ │ - Docker    │
       │ - /api/pm2  │ │ - SCP      │ │ - ClickHouse│
       │ - /api/files│ │ - Tippec.  │ │ - S3 CLI    │
       │ - Socket.IO │ │            │ │             │
       └─────────────┘ └────────────┘ └─────────────┘
```

### Flux de donnees

1. **Edition** : L'utilisateur dessine le workflow sur le canvas React Flow
2. **Sauvegarde** : `PUT /api/automations/{id}` enregistre nodes + edges + globalVars en JSON dans PostgreSQL
3. **Execution** : `POST /api/automations/{id}/run` cree un `AutomationRun` et lance le moteur en async (fire-and-forget)
4. **Moteur** : Calcule les couches d'execution (DAG), execute chaque couche en parallele, met a jour `nodeStates` et `nodeLogs` en DB apres chaque etape
5. **Monitoring** : Le frontend poll le run pour afficher l'etat en temps reel
6. **Arret** : `DELETE /api/automations/{id}/run/{runId}` signale un abort + kill les process PM2 sur les VPS

---

## 3. Modele de donnees

### Schema Prisma

```prisma
model Automation {
  id            String           @id @default(cuid())
  name          String
  type          AutomationType   @default(MENSUELLE)    // MENSUELLE | ANNUELLE | TRIMESTRIELLE | SEMESTRIELLE
  description   String?
  source        String?
  releaseDate   DateTime?
  status        AutomationStatus @default(DRAFT)        // DRAFT | READY | RUNNING | PAUSED | COMPLETED | FAILED

  categoryId    String
  category      AutomationCategory @relation(...)
  userId        String
  createdBy     User             @relation(...)

  nodes         Json             @default("[]")          // Array de noeuds React Flow
  edges         Json             @default("[]")          // Array de liens {source, target}
  globalVars    Json             @default("[]")          // Array de {key, value}

  workflowVps   AutomationVps[]                          // VPS associes au workflow
  runs          AutomationRun[]                          // Historique des executions
}

model AutomationVps {
  id            String     @id @default(cuid())
  automationId  String
  vpsId         String
  label         String                                   // Nom affiche (ex: "VPS Production")
  rootPath      String                                   // Repertoire de travail sur le VPS
  envPath       String?                                  // Chemin vers un fichier .env (optionnel)

  @@unique([automationId, vpsId, label])
}

model AutomationRun {
  id            String           @id @default(cuid())
  automationId  String
  status        AutomationStatus @default(RUNNING)
  startedAt     DateTime         @default(now())
  finishedAt    DateTime?
  nodeStates    Json             @default("{}")           // { nodeId: {status, startedAt, finishedAt, error, activePm2Name} }
  nodeLogs      Json             @default("{}")           // { nodeId: ["ligne1", "ligne2", ...] }
  userId        String
}
```

### Statuts

| Statut | Description |
|--------|-------------|
| `DRAFT` | Brouillon, pas encore pret |
| `READY` | Pret a etre execute |
| `RUNNING` | En cours d'execution |
| `PAUSED` | En pause (reserve pour usage futur) |
| `COMPLETED` | Termine avec succes |
| `FAILED` | Echoue (au moins un noeud en erreur) |

### Structure d'un noeud (JSON dans `nodes`)

```typescript
{
  id: "node-1711234567890",
  type: "automationNode",
  position: { x: 100, y: 200 },
  data: {
    label: "Export permis",           // Nom affiche
    vpsId: "clxxx...",                // ID du AutomationVps associe
    estimatedDuration: 30,            // Duree estimee en minutes
    notes: "Export mensuel",          // Notes libres
    nodeType: "db_export",            // Type du noeud (voir section 4)
    config: {                         // Configuration specifique au type
      dockerContainer: "clickhouse-server",
      query: "SELECT * FROM permis",
      outputFile: "/data/export.csv"
    }
  }
}
```

### Structure d'un lien (JSON dans `edges`)

```typescript
{
  source: "node-1711234567890",       // ID du noeud source
  target: "node-1711234567891"        // ID du noeud cible
}
```

---

## 4. Types de noeuds

### 4.1 PM2 Script (`pm2_script`)

Execute un script npm via PM2 sur le VPS cible.

```typescript
interface PM2Config {
  scriptFile: string;    // Fichier du script (info)
  pm2Name: string;       // Nom du process PM2
  npmCommand: string;    // Commande npm (ex: "run download")
}
```

**Comportement** :
- Appelle `/api/pm2/run-script` sur l'agent VPS
- Se connecte en Socket.IO pour les logs temps reel
- Polling toutes les 15 secondes, max 2400 cycles (10h)
- Surveille CPU et memoire du process

**Commande generee** : `pm2 start npm --name "{pm2Name}" --no-autorestart -- run {npmCommand}`

### 4.2 SSH Command (`ssh_command`)

Execute une commande shell sur le VPS cible. Deux modes :

**Mode structure** (Docker) :
```typescript
interface SSHConfig {
  mode: "structured";
  dockerContainer: string;   // Nom du container Docker
  dockerCommand: string;     // Commande dans le container
  query?: string;            // Requete optionnelle (--query="...")
  outputFile?: string;       // Redirection de sortie (> fichier)
}
```
Commande generee : `docker exec -i {container} {command} --query="{query}" > {outputFile}`

**Mode libre** (Freeform) :
```typescript
interface SSHConfig {
  mode: "freeform";
  rawCommand: string;        // Commande brute
}
```

**Timeout** : 10 minutes (avec fallback PM2 si `/api/exec` indisponible)

### 4.3 SCP Transfer (`scp_transfer`)

Transfere un fichier entre deux VPS via SCP.

```typescript
interface SCPConfig {
  sourceVpsId: string;   // ID du AutomationVps source
  sourcePath: string;    // Chemin du fichier source
  destVpsId: string;     // ID du AutomationVps destination
  destPath: string;      // Chemin de destination
}
```

**Comportement** :
- Resout les chemins relatifs par rapport au `rootPath` du VPS source
- Execute la commande SCP depuis le VPS source vers le VPS destination
- **Timeout** : 1 heure

**Commande generee** : `scp {sourcePath} {destUsername}@{destHost}:{destPath}`

### 4.4 DB Export (`db_export`)

Exporte des donnees ClickHouse vers un fichier.

```typescript
interface DBExportConfig {
  dockerContainer: string;   // Container ClickHouse
  query: string;             // Requete SQL
  outputFile: string;        // Fichier de sortie
}
```

**Comportement** :
- **Toujours via PM2** (pas `/api/exec`) car les exports peuvent durer 30min+
- La requete est nettoyee : retours a la ligne supprimes, espaces multiples collapses
- **Timeout** : 2 heures

**Commande generee** : `docker exec -i {container} clickhouse client --query="{cleanQuery}" > {outputFile}`

### 4.5 DB Import (`db_import`)

Importe des donnees via un script bash avec variables d'environnement optionnelles.

```typescript
interface DBImportConfig {
  scriptPath: string;                          // Chemin du script OU commande complete
  variables: { key: string; value: string }[]; // Variables d'environnement
}
```

**Deux modes** :
1. **Variables renseignees** : `DB_NAME="permis" TABLE="data" bash ./init.sh`
2. **Sans variables** : `scriptPath` est utilise tel quel comme commande complete

**Timeout** : 2 heures (toujours via PM2)

### 4.6 Tippecanoe (`tippecanoe`)

Genere des tuiles vectorielles (.pmtiles) a partir de fichiers GeoJSON.

```typescript
interface TippecanoeConfig {
  inputFile: string;     // Fichier GeoJSON d'entree
  outputDir: string;     // Repertoire de sortie
  outputName: string;    // Nom du fichier de sortie
  minZoom: number;       // Zoom minimum (defaut: 14)
  maxZoom: number;       // Zoom maximum (defaut: 22)
  dropRate: number;      // Taux de suppression (defaut: 0)
  flags: string[];       // Flags additionnels tippecanoe
}
```

**Comportement** :
- Ecrit un script `.sh` sur le VPS dans `/tmp/` (car PM2 ne passe pas correctement les arguments avec `bash -c`)
- Utilise `PIPESTATUS[0]` pour capturer le code de sortie de tippecanoe (pas celui de `tee`)
- Lit le fichier de log pour extraire le pourcentage de progression (`\d+\.\d+%`)
- Surveille CPU et memoire pendant l'execution
- Verifie que le fichier `.pmtiles` existe en sortie
- **Timeout** : 4 heures

**Commande generee** : `tippecanoe -o {output}.pmtiles --minimum-zoom={min} --maximum-zoom={max} --drop-rate={rate} {flags} {input} 2>&1 | tee {logPath}`

**Fichier de log** : `output{nomDuFichier}.log` dans le meme repertoire que le `.pmtiles`

### 4.7 S3/R2 Upload (`s3_upload`)

Upload des fichiers vers un bucket S3/R2 (Cloudflare).

```typescript
interface S3Config {
  files: string[];       // Liste des chemins de fichiers a uploader
  bucket: string;        // Nom du bucket
  endpoint: string;      // URL de l'endpoint S3/R2
  profile: string;       // Profil AWS CLI
  prefix: string;        // Prefixe dans le bucket (ex: "permis/")
}
```

**Comportement** :
- Upload les fichiers **sequentiellement** (un par un)
- S'arrete au premier echec
- **Timeout** : 5 minutes par fichier

**Commande generee** : `aws s3 cp {file} s3://{bucket}/{prefix}{filename} --endpoint-url {endpoint} --profile {profile}`

---

## 5. Moteur d'execution (Engine)

Fichier : `src/lib/automation-engine/engine.ts`

### Fonction principale : `runAutomation(automation, runId, fromNodeId?)`

1. **Initialisation** :
   - Cree un `AbortController` pour l'annulation
   - Construit la map des clients VPS (`VpsClient` par `workflowVps.id`)
   - Calcule les couches d'execution (DAG)
   - Si `fromNodeId` est fourni, marque les noeuds en amont comme COMPLETED/skip

2. **Execution couche par couche** :
   ```
   Couche 0 : [NoeudA, NoeudB]  ← pas de dependances, executes en parallele
   Couche 1 : [NoeudC, NoeudD]  ← dependent de la couche 0
   Couche 2 : [NoeudE]          ← depend de la couche 1
   ```
   - Tous les noeuds d'une couche s'executent en parallele (`Promise.all`)
   - La couche suivante attend que tous les noeuds de la couche precedente soient termines

3. **Pour chaque noeud** :
   - Verifie que tous les parents sont COMPLETED
   - Resout le VPS cible
   - Selectionne l'executor correspondant au `nodeType`
   - Execute et met a jour les `nodeStates` et `nodeLogs` en DB

4. **Cascade d'erreurs** :
   - Si un noeud echoue dans une couche, tous les noeuds en aval sont marques comme non executes
   - L'execution s'arrete (break)

5. **Statut final** :
   - `COMPLETED` si tous les noeuds sont termines
   - `FAILED` si au moins un noeud a echoue ou si abort

### Fonction : `stopAutomationRun(runId)`

1. Signale l'abort via `AbortController`
2. Kill tous les process PM2 actifs sur les VPS
3. Supprime le run de la map en memoire

### Redemarrage partiel (`fromNodeId`)

Permet de relancer un workflow a partir d'un noeud specifique (ex: apres correction d'un echec) :
- Les noeuds en amont du noeud cible sont marques COMPLETED + skipped
- Le noeud cible et tous ses descendants sont executes normalement

---

## 6. Strategies d'execution des commandes

Fichier : `src/lib/automation-engine/executors/index.ts`

L'agent VPS fournit 2 modes d'execution :

### Mode 1 : Synchrone (`/api/exec`)

```
Next.js → POST /api/exec → agent execute child_process.exec → retourne {stdout, stderr, exitCode}
```

- **Utilise pour** : commandes courtes (< 10 min), SSH, SCP, S3
- Bloque jusqu'a la fin de la commande
- Timeout par defaut : 10 minutes

### Mode 2 : Asynchrone PM2 (`/api/pm2/start` + polling)

```
Next.js → POST /api/pm2/start → retour immediat
        → poll GET /api/pm2/list toutes les 15s
        → Socket.IO pour les logs temps reel
```

- **Utilise pour** : commandes longues (30 min → 10h), DB export/import, Tippecanoe, PM2 scripts
- Le moteur poll toutes les 15 secondes
- Logs streames via Socket.IO (optionnel)

### Strategie de fallback

Si `/api/exec` retourne 404 (agent non mis a jour), le moteur bascule automatiquement en mode PM2 :

```typescript
// Essai /api/exec d'abord
const result = await client.exec(command, cwd, timeout);

// Si 404 → fallback PM2
if (result.error?.includes("404")) {
  return runCommandViaPm2(opts);
}
```

### Approche script file (PM2)

PM2 ne passe pas correctement les arguments avec `bash -c "commande"`. Solution :

1. Ecrire un script `.sh` dans `/tmp/{pm2Name}.sh`
2. PM2 execute le script avec `interpreter: "bash"`
3. Le script capture le code de sortie dans `/tmp/.pm2-exit-{pm2Name}`
4. Le moteur lit ce fichier pour determiner le succes/echec

```bash
#!/bin/bash
{commande_reelle}
__EXIT=$?
echo $__EXIT > /tmp/.pm2-exit-{pm2Name}
exit $__EXIT
```

---

## 7. Gestion du graphe (DAG)

Fichier : `src/lib/automation-engine/dag.ts`

### Tri topologique (Algorithme de Kahn)

```typescript
topologicalSort(nodes, edges): string[]
```
Retourne les IDs des noeuds tries par ordre de dependance. Detecte les cycles (lance une erreur si `sorted.length !== nodes.length`).

### Couches d'execution

```typescript
getExecutionLayers(nodes, edges): string[][]
```
Regroupe les noeuds en couches parallelisables :
- Couche 0 : noeuds sans dependance (in-degree = 0)
- Couche N : noeuds dont toutes les dependances sont dans les couches 0..N-1

### Navigation du graphe

```typescript
getParents(nodeId, edges): string[]          // Parents directs
getChildren(nodeId, edges): string[]         // Enfants directs
getDownstreamNodes(nodeId, edges): string[]  // Tous les descendants (transitif, BFS)
```

### Detection de cycles

Les deux fonctions `topologicalSort` et `getExecutionLayers` detectent les cycles. Si un cycle est present, l'erreur `"Cycle detecte dans le graphe d'automatisation"` est lancee.

---

## 8. Variables globales

Fichier : `src/lib/automation-engine/env-resolver.ts`

### Syntaxe

Les variables utilisent la notation `{{NOM_VARIABLE}}` dans les configurations des noeuds.

```
Exemple : /data/export_{{YEAR}}_{{PERIOD}}.csv
Avec     : YEAR=2025, PERIOD=03
Resultat : /data/export_2025_03.csv
```

### Resolution

```typescript
resolveVars(template, vars): string       // Remplace dans une chaine
resolveVarsDeep(obj, vars): T             // Remplace recursif dans un objet
```

- Parcours recursif : chaines, tableaux, objets
- Les placeholders non resolus restent tels quels (texte litteral)

### Stockage

Les variables sont stockees dans `Automation.globalVars` :
```json
[
  { "key": "YEAR", "value": "2025" },
  { "key": "PERIOD", "value": "03" },
  { "key": "DEPARTMENT", "value": "permis" }
]
```

---

## 9. API REST

### Automations

| Methode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/automations` | Lister les automations (filtre par `?categoryId=`) |
| `POST` | `/api/automations` | Creer une automation |
| `GET` | `/api/automations/{id}` | Recuperer une automation (avec VPS, runs, categorie) |
| `PUT` | `/api/automations/{id}` | Mettre a jour (name, type, status, nodes, edges, globalVars...) |
| `DELETE` | `/api/automations/{id}` | Supprimer une automation (cascade sur VPS et runs) |
| `POST` | `/api/automations/{id}/duplicate` | Dupliquer (copie noeuds, edges, variables, VPS) |

### Runs (Executions)

| Methode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/automations/{id}/run` | Demarrer un run (`{ fromNodeId? }` pour restart partiel) |
| `GET` | `/api/automations/{id}/run` | Lister les runs (max 20, ordre desc) |
| `GET` | `/api/automations/{id}/run/{runId}` | Recuperer un run (nodeStates, nodeLogs) |
| `DELETE` | `/api/automations/{id}/run/{runId}` | Arreter un run (abort + kill PM2 sur VPS) |

### VPS du workflow

| Methode | Route | Description |
|---------|-------|-------------|
| `GET/POST` | `/api/automations/{id}/vps` | Lister / Ajouter un VPS au workflow |
| `PUT/DELETE` | `/api/automations/{id}/vps/{vpsId}` | Modifier / Retirer un VPS |
| `POST` | `/api/automations/{id}/vps/{vpsId}/verify` | Verifier la connexion a l'agent |
| `GET/PUT` | `/api/automations/{id}/vps/{vpsId}/env` | Lire / Modifier le .env du VPS |

### Categories

| Methode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/automations/categories` | Lister les categories |

### Corps de requete : Creer une automation

```json
{
  "name": "Export mensuel permis",
  "type": "MENSUELLE",
  "description": "Pipeline d'export et traitement",
  "categoryId": "clxxx..."
}
```

### Corps de requete : Demarrer un run

```json
{
  "fromNodeId": "node-123..."   // optionnel : restart partiel
}
```

### Corps de requete : Sauvegarder le canvas

```json
{
  "nodes": [ /* noeuds React Flow */ ],
  "edges": [ /* liens */ ],
  "globalVars": [ { "key": "YEAR", "value": "2025" } ]
}
```

---

## 10. Interface utilisateur (Canvas)

Fichier : `src/app/(dashboard)/dashboard/automations/[id]/page.tsx`

### Composants principaux

- **Canvas React Flow** : Editeur visuel drag & drop des noeuds et liens
- **Panneau gauche** : Palette de noeuds (7 types) + historique des runs
- **Panneau droit** : Configuration du noeud selectionne (onglets Config / Logs)

### Noeuds custom (`AutomationNode`)

- Couleur et icone par type de noeud
- Handles gauche (entree) et droit (sortie)
- Indicateur de statut pendant l'execution (RUNNING pulse anime, COMPLETED vert, FAILED rouge)

### Fonctionnalites du canvas

| Fonctionnalite | Description |
|---|---|
| **Ajouter un noeud** | Clic sur un type dans la palette gauche |
| **Dupliquer un noeud** | Bouton copie dans le panneau droit (deep clone + decalage + suffixe "copie") |
| **Supprimer un noeud** | Bouton supprimer dans le panneau droit (supprime aussi les liens connectes) |
| **Creer un lien** | Glisser d'un handle de sortie vers un handle d'entree |
| **Supprimer un lien** | Selectionner le lien + touche Suppr (desactive quand verrouille) |
| **Deplacer un lien** | Glisser l'extremite d'un lien vers un autre noeud (reconnexion) |
| **Verrouillage** | Bouton cadenas pour empecher les modifications accidentelles |
| **Zoom** | Zoom in/out + ajuster a la vue |
| **Mini-map** | Vue miniature du graphe complet |

### Edges

- Style : ligne animee bleue, 2px
- Type par defaut : smoothstep
- Reconnectables (glisser l'extremite pour changer la cible)
- Supprimables par touche Delete quand deselectionne

---

## 11. Gestion des erreurs

### Erreurs par noeud

| Condition | Message | Comportement |
|-----------|---------|-------------|
| Parents non termines | `"Parent node(s) not completed"` | Noeud marque FAILED |
| VPS non configure | `"Aucun VPS configure pour ce noeud"` | Noeud marque FAILED |
| Type inconnu | `"Type de noeud inconnu: {type}"` | Noeud marque FAILED |
| Code de sortie != 0 | `"Exit code: {code}"` | Noeud marque FAILED |
| Timeout depasse | `"Timeout (> {X}min)"` | Noeud marque FAILED |
| PM2 en erreur | `"Commande echouee (PM2 errored)"` | Noeud marque FAILED |
| Abort utilisateur | `"Execution annulee"` | Noeud marque FAILED |
| Ecriture script impossible | `"Echec ecriture script"` | Noeud marque FAILED |

### Cascade d'erreurs

Quand un noeud echoue dans une couche :
1. Tous les noeuds **en aval** (descendants transitifs) sont marques avec `error: "Noeud parent echoue"`
2. Ces noeuds ne seront pas executes
3. L'execution du workflow s'arrete
4. Le statut final du run est `FAILED`

### Arret manuel

Quand l'utilisateur arrete un run :
1. L'`AbortController` est signale → les executors en cours s'arretent
2. Les process PM2 actifs sont tues sur chaque VPS (`deleteProcess`)
3. Pour les noeuds SCP, le PM2 est aussi tue sur le VPS source
4. Les noeuds RUNNING sont marques `FAILED` avec `error: "Arrete manuellement"`
5. Le run et l'automation sont marques `FAILED`

### Erreur fatale du moteur

Si le moteur lui-meme plante (erreur non capturee) :
- Le run est marque FAILED avec la date de fin
- L'automation est marquee FAILED
- Le run est retire de la map `activeRuns` (bloc `finally`)

---

## 12. Timeouts et limites

| Operation | Timeout | Justification |
|-----------|---------|---------------|
| PM2 Script | 10 heures (2400 cycles × 15s) | Scripts npm longs (download, processing) |
| SSH Command | 10 minutes | Commandes courtes, fallback PM2 si indisponible |
| SCP Transfer | 1 heure | Transferts de gros fichiers entre VPS |
| DB Export (ClickHouse) | 2 heures | Tables volumineuses |
| DB Import | 2 heures | Scripts d'initialisation complexes |
| Tippecanoe | 4 heures | Generation de tuiles CPU-intensive |
| S3 Upload | 5 minutes par fichier | Uploads sequentiels |

### Autres limites

| Limite | Valeur |
|--------|--------|
| Historique des runs (API) | 20 derniers |
| Historique des runs (page detail) | 10 derniers |
| Polling PM2 | Toutes les 15 secondes |
| Socket.IO timeout connexion | 3-5 secondes |
| Requete HTTP agent VPS | 10 secondes timeout |

---

## 13. Fichiers cles

| Fichier | Role |
|---------|------|
| `src/types/automation.ts` | Types TypeScript (NodeType, configs, DTOs) |
| `src/lib/automation-engine/engine.ts` | Moteur d'execution principal |
| `src/lib/automation-engine/dag.ts` | Utilitaires DAG (tri topologique, couches, parcours) |
| `src/lib/automation-engine/env-resolver.ts` | Resolution des variables `{{VAR}}` |
| `src/lib/automation-engine/executors/index.ts` | 7 executors + strategies d'execution |
| `src/lib/vps-client.ts` | Client HTTP pour communiquer avec les agents VPS |
| `src/app/api/automations/route.ts` | API : lister / creer des automations |
| `src/app/api/automations/[id]/route.ts` | API : CRUD automation individuelle |
| `src/app/api/automations/[id]/duplicate/route.ts` | API : dupliquer une automation |
| `src/app/api/automations/[id]/run/route.ts` | API : demarrer un run / lister les runs |
| `src/app/api/automations/[id]/run/[runId]/route.ts` | API : statut d'un run / arreter un run |
| `src/app/api/automations/[id]/vps/route.ts` | API : gestion des VPS du workflow |
| `src/app/(dashboard)/dashboard/automations/[id]/page.tsx` | UI : canvas d'edition + monitoring |
| `prisma/schema.prisma` | Schema de base de donnees |

---

## Annexe : Agent VPS (endpoints requis)

Chaque VPS doit executer un agent Node.js exposant les endpoints suivants sur le port configure (`agentPort`, defaut 4000) :

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `/health` | GET | Health check |
| `/api/system/stats` | GET | Statistiques CPU/RAM/Disque |
| `/api/pm2/list` | GET | Lister les process PM2 |
| `/api/pm2/start` | POST | Demarrer un process PM2 |
| `/api/pm2/run-script` | POST | Executer un script npm via PM2 |
| `/api/pm2/stop/{name}` | POST | Arreter un process |
| `/api/pm2/restart/{name}` | POST | Redemarrer un process |
| `/api/pm2/delete/{name}` | DELETE | Supprimer un process |
| `/api/exec` | POST | Execution synchrone de commande shell |
| `/api/files/read?path=` | GET | Lire un fichier |
| `/api/files/write` | POST | Ecrire un fichier |
| `/api/files/list?path=` | GET | Lister un repertoire |
| `/api/docker/containers` | GET | Lister les containers Docker |

**Authentification** : Header `X-API-Key` sur toutes les requetes.

**Socket.IO** : L'agent expose aussi un serveur Socket.IO pour le streaming des logs PM2 :
- **Auth** : `{ apiKey: "..." }`
- **Emit** : `logs:subscribe` avec `{ processName: "..." }`
- **Receive** : `logs:data` avec `{ timestamp, type: "out"|"err", data: "..." }`
