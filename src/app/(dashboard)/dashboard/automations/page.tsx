"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Workflow,
  Calendar,
  Clock,
  Play,
  Copy,
  Trash2,
  Loader2,
  X,
  Search,
  Filter,
} from "lucide-react";
import { formatDate, getStatusBadgeVariant } from "@/lib/utils";
import type {
  Automation,
  AutomationCategory,
  AutomationType,
  CreateAutomationDto,
} from "@/types/automation";
import {
  AUTOMATION_TYPE_LABELS,
  AUTOMATION_STATUS_LABELS,
} from "@/types/automation";

const AUTOMATION_TYPES: { value: AutomationType; label: string }[] = [
  { value: "MENSUELLE", label: "Mensuelle" },
  { value: "ANNUELLE", label: "Annuelle" },
  { value: "TRIMESTRIELLE", label: "Trimestrielle" },
  { value: "SEMESTRIELLE", label: "Semestrielle" },
];

export default function AutomationsPage() {
  const router = useRouter();

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [categories, setCategories] = useState<AutomationCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState<CreateAutomationDto>({
    name: "",
    type: "MENSUELLE",
    description: "",
    source: "",
    releaseDate: "",
    categoryId: "",
    categoryName: "",
  });
  const [isNewCategory, setIsNewCategory] = useState(false);

  // Deleting
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [automationsRes, categoriesRes] = await Promise.all([
        fetch("/api/automations"),
        fetch("/api/automations/categories"),
      ]);

      const automationsData = await automationsRes.json();
      const categoriesData = await categoriesRes.json();

      if (automationsData.success) setAutomations(automationsData.data);
      if (categoriesData.success) setCategories(categoriesData.data);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      alert("Le nom est requis");
      return;
    }
    if (!formData.categoryId && !formData.categoryName?.trim()) {
      alert("Sélectionnez ou créez une catégorie");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        router.push(`/dashboard/automations/${data.data.id}`);
      } else {
        alert(data.error || "Erreur lors de la création");
      }
    } catch (error) {
      console.error("Error:", error);
      alert("Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/automations/${id}/duplicate`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        alert(data.error || "Erreur lors de la duplication");
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleDelete = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Supprimer l'automatisation "${name}" ?`)) return;

    setDeleting(id);
    try {
      const res = await fetch(`/api/automations/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        alert(data.error || "Erreur lors de la suppression");
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setDeleting(null);
    }
  };

  const openCreateModal = () => {
    setFormData({
      name: "",
      type: "MENSUELLE",
      description: "",
      source: "",
      releaseDate: "",
      categoryId: "",
      categoryName: "",
    });
    setIsNewCategory(false);
    setShowCreateModal(true);
  };

  // Filtered automations
  const filtered = automations.filter((a) => {
    if (filterCategory && a.categoryId !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.category.name.toLowerCase().includes(q) ||
        a.source?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by category
  const grouped = filtered.reduce(
    (acc, a) => {
      const catName = a.category.name;
      if (!acc[catName]) acc[catName] = [];
      acc[catName].push(a);
      return acc;
    },
    {} as Record<string, Automation[]>
  );

  const getNodeCount = (a: Automation) =>
    Array.isArray(a.nodes) ? a.nodes.length : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automatisations</h1>
          <p className="text-muted-foreground">
            {automations.length} automatisation{automations.length !== 1 ? "s" : ""} &middot;{" "}
            {categories.length} catégorie{categories.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" />
          Créer une automatisation
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Toutes les catégories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      ) : automations.length === 0 ? (
        <div className="text-center py-16">
          <Workflow className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Aucune automatisation</h2>
          <p className="text-muted-foreground mb-4">
            Créez votre première automatisation pour commencer
          </p>
          <Button onClick={openCreateModal}>
            <Plus className="h-4 w-4 mr-2" />
            Créer une automatisation
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Search className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Aucun résultat pour cette recherche</p>
        </div>
      ) : (
        Object.entries(grouped).map(([catName, items]) => (
          <div key={catName} className="space-y-3">
            <h2 className="text-lg font-semibold text-muted-foreground border-b pb-2">
              {catName}
              <span className="ml-2 text-sm font-normal">
                ({items.length})
              </span>
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((automation) => (
                <Card
                  key={automation.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() =>
                    router.push(`/dashboard/automations/${automation.id}`)
                  }
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base truncate">
                          {automation.name}
                        </CardTitle>
                        {automation.source && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {automation.source}
                          </p>
                        )}
                      </div>
                      <Badge variant={getStatusBadgeVariant(automation.status)}>
                        {AUTOMATION_STATUS_LABELS[automation.status]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {AUTOMATION_TYPE_LABELS[automation.type]}
                      </span>
                      {automation.releaseDate && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(automation.releaseDate)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{getNodeCount(automation)} noeuds</span>
                      <span>{automation.workflowVps?.length || 0} VPS</span>
                      <span>{(automation as Automation & { _count?: { runs: number } })._count?.runs || 0} runs</span>
                    </div>

                    {automation.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {automation.description}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1 pt-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/dashboard/automations/${automation.id}`);
                        }}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        Ouvrir
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => handleDuplicate(automation.id, e)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Dupliquer
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-500 hover:text-red-600 ml-auto"
                        onClick={(e) => handleDelete(automation.id, automation.name, e)}
                        disabled={deleting === automation.id}
                      >
                        {deleting === automation.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Modal Créer */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowCreateModal(false)}
          />
          <Card className="relative z-10 w-full max-w-lg mx-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Nouvelle automatisation</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowCreateModal(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Nom */}
              <div className="space-y-2">
                <Label htmlFor="auto-name">Nom *</Label>
                <Input
                  id="auto-name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="Ex: Autorisation d'urbanisme"
                />
              </div>

              {/* Type */}
              <div className="space-y-2">
                <Label htmlFor="auto-type">Type *</Label>
                <select
                  id="auto-type"
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      type: e.target.value as AutomationType,
                    })
                  }
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {AUTOMATION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Catégorie */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Catégorie *</Label>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      setIsNewCategory(!isNewCategory);
                      setFormData({
                        ...formData,
                        categoryId: "",
                        categoryName: "",
                      });
                    }}
                  >
                    {isNewCategory
                      ? "Sélectionner existante"
                      : "+ Nouvelle catégorie"}
                  </button>
                </div>
                {isNewCategory ? (
                  <Input
                    placeholder="Nom de la nouvelle catégorie"
                    value={formData.categoryName || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        categoryName: e.target.value,
                        categoryId: "",
                      })
                    }
                  />
                ) : (
                  <select
                    value={formData.categoryId || ""}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        categoryId: e.target.value,
                        categoryName: "",
                      })
                    }
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Sélectionner...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Source */}
              <div className="space-y-2">
                <Label htmlFor="auto-source">Source</Label>
                <Input
                  id="auto-source"
                  value={formData.source || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, source: e.target.value })
                  }
                  placeholder="Ex: Ministère Territoires Écologie Logement"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="auto-desc">Description</Label>
                <textarea
                  id="auto-desc"
                  value={formData.description || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Description de l'automatisation..."
                  className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                  rows={2}
                />
              </div>

              {/* Date de sortie */}
              <div className="space-y-2">
                <Label htmlFor="auto-date">Date de sortie</Label>
                <Input
                  id="auto-date"
                  type="date"
                  value={formData.releaseDate || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, releaseDate: e.target.value })
                  }
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                >
                  Annuler
                </Button>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Créer
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
