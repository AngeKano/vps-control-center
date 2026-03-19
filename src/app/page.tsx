import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Server, ArrowRight, Shield, Activity, Terminal } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center space-y-8">
          <div className="mx-auto p-4 rounded-full bg-primary/10 w-fit">
            <Server className="h-16 w-16 text-primary" />
          </div>
          <h1 className="text-5xl font-bold text-white">VPS Control Center</h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Dashboard de contrôle pour gérer vos VPS, scripts PM2, logs en temps réel et monitoring système
          </p>

          <Link href="/login">
            <Button size="lg" className="mt-4">
              Accéder au Dashboard
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>

          <div className="grid md:grid-cols-3 gap-6 mt-16 text-left">
            <div className="p-6 rounded-xl bg-gray-800/50 border border-gray-700">
              <div className="p-3 rounded-lg bg-blue-500/10 w-fit mb-4">
                <Terminal className="h-6 w-6 text-blue-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Contrôle PM2</h3>
              <p className="text-gray-400">Démarrez, arrêtez et redémarrez vos processus PM2 à distance</p>
            </div>

            <div className="p-6 rounded-xl bg-gray-800/50 border border-gray-700">
              <div className="p-3 rounded-lg bg-green-500/10 w-fit mb-4">
                <Activity className="h-6 w-6 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Monitoring temps réel</h3>
              <p className="text-gray-400">Surveillez CPU, RAM et espace disque de tous vos serveurs</p>
            </div>

            <div className="p-6 rounded-xl bg-gray-800/50 border border-gray-700">
              <div className="p-3 rounded-lg bg-purple-500/10 w-fit mb-4">
                <Shield className="h-6 w-6 text-purple-500" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Sécurisé</h3>
              <p className="text-gray-400">Authentification sécurisée avec rôles (Admin, Operator, Viewer)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
