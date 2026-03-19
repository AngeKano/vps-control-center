# VPS Control Center

Dashboard de contrôle multi-VPS avec gestion PM2, logs temps réel et monitoring.

## 🚀 Installation rapide

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

## ⚙️ Configuration

Fichier `.env`:
```env
DATABASE_URL="postgresql://vps_admin:VpsControl2025!@localhost:5432/vps_control"
NEXTAUTH_SECRET="votre-secret-genere"  # openssl rand -base64 32
NEXTAUTH_URL="http://localhost:3000"
VPS_API_KEY="votre-cle-api"            # openssl rand -hex 32
```

## 📋 Fonctionnalités

- **Dashboard** - Vue d'ensemble
- **VPS** - Monitoring CPU/RAM/Disque temps réel
- **Scripts** - Contrôle PM2 (Start/Stop/Restart)
- **Logs** - Streaming WebSocket
- **Projects** - Organisation par projet
- **Database** - Requêtes ClickHouse
- **Transfers** - SCP entre serveurs
- **Monitoring** - Vue globale auto-refresh
- **Settings** - Configuration

## 🔧 Commandes

```bash
npm run dev        # Développement
npm run build      # Build production
npm start          # Production
npm run db:push    # Sync schéma
npm run db:seed    # Données test
npm run db:studio  # Admin Prisma
npm run db:reset   # Reset complet
```

## 📦 Stack technique

- Next.js 15 + React 19
- NextAuth v5
- Prisma + PostgreSQL
- Socket.io (logs temps réel)
- Tailwind CSS
- Radix UI
