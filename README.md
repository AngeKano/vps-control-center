# VPS Control Center

Dashboard de contrôle multi-VPS avec gestion PM2, logs temps réel, monitoring et automatisations visuelles (canvas DAG).

## Installation rapide

```bash
# 1. Extraire et installer
unzip vps-control-center.zip
cd vps-control-center
npm install

# 2. PostgreSQL avec Docker
docker compose up -d

# 3. Initialiser la base
npm run db:push
npm run db:seed

# 4. Démarrer
npm run dev
```

**Accès:** http://localhost:3000

**Identifiants:**
- Admin: `admin@vpscontrol.local` / `Admin2025!`
- Operator: `operator@vpscontrol.local` / `Operator2025!`
- Viewer: `viewer@vpscontrol.local` / `Viewer2025!`

## Configuration

Fichier `.env`:
```env
DATABASE_URL="postgresql://vps_admin:VpsControl2025!@localhost:5432/vps_control"
NEXTAUTH_SECRET="votre-secret-genere"  # openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
VPS_API_KEY="votre-cle-api"            # openssl rand -hex 32
```

## Fonctionnalites

- **Dashboard** - Vue d'ensemble
- **VPS** - Monitoring CPU/RAM/Disque temps réel
- **Scripts** - Contrôle PM2 (Start/Stop/Restart)
- **Logs** - Streaming WebSocket
- **Projects** - Organisation par projet
- **Database** - Requêtes ClickHouse
- **Transfers** - SCP entre serveurs
- **Monitoring** - Vue globale auto-refresh
- **Settings** - Configuration
- **Automations** - Pipelines visuels multi-VPS (canvas DAG)

## Automations

Canvas visuel pour orchestrer des pipelines de traitement de données sur plusieurs VPS. Les noeuds sont exécutés par couches (DAG) avec suivi temps réel.

### Types de noeuds

| Noeud | Description |
|-------|-------------|
| **PM2 Script** | Lancement de scripts npm via PM2 |
| **SSH Command** | Exécution de commandes shell (freeform ou structured Docker) |
| **SCP Transfer** | Copie de fichiers entre VPS |
| **DB Export** | Export ClickHouse via Docker (requêtes longues, PM2) |
| **DB Import** | Exécution de scripts bash avec variables d'environnement |
| **Tippecanoe** | Génération de tuiles vectorielles PMTiles depuis GeoJSON |
| **S3/R2 Upload** | Upload de fichiers vers S3/Cloudflare R2 |

### Tippecanoe

Convertit un fichier GeoJSON/JSON en tuiles vectorielles `.pmtiles`.

**Config :**
- Fichier GeoJSON : chemin relatif au rootPath ou absolu
- Répertoire de sortie : relatif ou absolu (defaut: rootPath)
- Nom fichier final : defaut = même nom que le GeoJSON + `.pmtiles`
- Zoom min/max, drop rate, flags (--no-feature-limit, --no-tile-size-limit, etc.)

**Execution :** Ecrit un script `.sh` sur le VPS, lancé via PM2. La progression est lue depuis le fichier log (`output{nom}.log`) et le status PM2 est pollé toutes les 15s. Timeout: 4h max.

**Fichier log :** `output{nom-pmtiles}.log` dans le même répertoire que le `.pmtiles`. L'utilisateur peut aussi faire `tail -f` manuellement.

### S3/R2 Upload

Upload de fichiers vers un bucket S3/R2.

**Config :**
- Fichiers : un chemin par ligne (relatif au rootPath ou absolu)
- Bucket, Endpoint, Profile, Prefix
- Destination auto: `s3://{bucket}/{prefix}{nom-du-fichier}`

### Execution des commandes (runCommandViaPm2)

Les commandes longues sont exécutées via PM2 avec l'approche **script file** :
1. Ecriture d'un script `.sh` sur le VPS via `/api/files/write`
2. PM2 start avec `interpreter: "bash"` et le script comme fichier
3. Poll PM2 status toutes les 15s + Socket.IO pour les logs temps réel
4. Capture du exit code via fichier temporaire `/tmp/.pm2-exit-{name}`

Cette approche est utilisée car l'agent VPS ne passe pas correctement les args avec `bash -c "commande"`.

### Recovery (reprise après déconnexion)

Si le PC est fermé pendant une exécution, les process PM2 continuent sur le VPS. Au retour :
1. L'UI détecte automatiquement les runs "stale" (status RUNNING sans polling actif)
2. Appel `POST /api/automations/{id}/run/{runId}/recover`
3. Vérifie l'état réel de chaque process PM2 sur le VPS
4. Met à jour les status des noeuds (COMPLETED/FAILED) selon le résultat
5. Si un process tourne encore, reprend le polling

Le champ `activePm2Name` est persisté dans les `nodeStates` en DB, ce qui permet de retrouver les process orphelins.

## Architecture technique

### Stack
- Next.js 15 + React 19 (App Router)
- NextAuth v5 (credentials, JWT)
- Prisma + PostgreSQL
- Socket.IO (logs temps réel)
- @xyflow/react (canvas automation)
- Tailwind CSS + Radix UI

### Communication VPS

L'app communique avec les VPS via un **agent HTTP** (pas SSH direct) :
- Base URL: `http://{host}:{agentPort}`
- Auth: header `X-API-Key`
- Endpoints : `/api/pm2/*`, `/api/files/*`, `/api/system/stats`, `/api/containers`
- `/api/exec` (optionnel, peut être absent sur agents anciens)

### Fichiers cles

| Fichier | Role |
|---------|------|
| `src/lib/automation-engine/engine.ts` | Orchestrateur DAG, exécution par couches |
| `src/lib/automation-engine/executors/index.ts` | Executeurs par type de noeud |
| `src/lib/automation-engine/dag.ts` | Algorithmes de graphe (tri topo, couches) |
| `src/lib/vps-client.ts` | Client HTTP vers l'agent VPS |
| `src/types/automation.ts` | Types TypeScript des configs de noeuds |
| `src/app/(dashboard)/dashboard/automations/[id]/page.tsx` | Canvas visuel + config noeuds |
| `src/app/api/automations/[id]/run/route.ts` | API creation/liste des runs |
| `src/app/api/automations/[id]/run/[runId]/route.ts` | API status/stop d'un run |
| `src/app/api/automations/[id]/run/[runId]/recover/route.ts` | API recovery des runs stale |
| `prisma/schema.prisma` | Schema base de données |

## Commandes

```bash
npm run dev        # Développement
npm run build      # Build production
npm start          # Production
npm run db:push    # Sync schema
npm run db:seed    # Données test
npm run db:studio  # Admin Prisma
npm run db:reset   # Reset complet
```
