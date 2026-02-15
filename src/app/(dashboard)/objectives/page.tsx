"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  Button,
  Badge,
  Input,
  Select,
  Modal,
  DeleteConfirmationModal,
  Spinner,
} from "@/components/ui";
import { Plus, Target, Trash, Edit2, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface Objective {
  id: string;
  name: string;
  event_date: string;
  event_type: string;
  priority: "A" | "B" | "C";
  target_time: string | null;
  notes: string | null;
  created_at: string;
}

const priorityColors: Record<string, string> = {
  A: "bg-accent/20 text-accent border border-accent/40",
  B: "bg-secondary/20 text-secondary border border-secondary/40",
  C: "bg-dark-200 text-muted border border-dark-300",
};

const priorityOptions = [
  { value: "A", label: "A — Principal" },
  { value: "B", label: "B — Secondaire" },
  { value: "C", label: "C — Informatif" },
];

function getCountdown(eventDate: string): string {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(eventDate);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) return "Passé";
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return "Demain";
  return `J-${diffDays}`;
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

const getDefaultForm = () => ({
  name: "",
  event_type: "",
  event_date: "",
  priority: "A" as "A" | "B" | "C",
  target_time: "",
  notes: "",
});

export default function ObjectivesPage() {
  const supabase = createClient();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(getDefaultForm);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadObjectives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadObjectives = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("objectives")
        .select("*")
        .eq("user_id", user.id)
        .order("event_date", { ascending: true });

      if (data) {
        setObjectives(data);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const sortedObjectives = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return [...objectives].sort((a, b) => {
      const aDate = new Date(a.event_date);
      const bDate = new Date(b.event_date);
      const aFuture = aDate >= now;
      const bFuture = bDate >= now;
      if (aFuture && !bFuture) return -1;
      if (!aFuture && bFuture) return 1;
      return aDate.getTime() - bDate.getTime();
    });
  }, [objectives]);

  const stats = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const active = objectives.filter((o) => new Date(o.event_date) >= now);
    const next = active.length > 0
      ? active.reduce((closest, o) => {
          const d = new Date(o.event_date);
          const c = new Date(closest.event_date);
          return d < c ? o : closest;
        })
      : null;
    return { activeCount: active.length, next };
  }, [objectives]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(getDefaultForm());
    setIsModalOpen(true);
  };

  const handleOpenEdit = (obj: Objective) => {
    setEditingId(obj.id);
    setForm({
      name: obj.name,
      event_type: obj.event_type,
      event_date: obj.event_date,
      priority: obj.priority,
      target_time: obj.target_time || "",
      notes: obj.notes || "",
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.event_date || !form.event_type) return;
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const payload = {
        name: form.name,
        event_type: form.event_type,
        event_date: form.event_date,
        priority: form.priority,
        target_time: form.target_time || null,
        notes: form.notes || null,
      };

      if (editingId) {
        await supabase
          .from("objectives")
          .update(payload)
          .eq("id", editingId)
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("objectives")
          .insert({ ...payload, user_id: user.id });
      }

      setIsModalOpen(false);
      await loadObjectives();
    } catch (error) {
      console.error("Error saving objective:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeletingId(deleteTarget.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("objectives")
        .delete()
        .eq("id", deleteTarget.id)
        .eq("user_id", user.id);

      setDeleteTarget(null);
      await loadObjectives();
    } catch (error) {
      console.error("Error deleting objective:", error);
    } finally {
      setIsDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">Objectifs</h1>
          <p className="text-muted">
            Gérez vos objectifs sportifs et suivez votre progression
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={handleOpenCreate}
        >
          Nouvel objectif
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card padding="sm" className="flex items-center gap-4">
          <div className="h-10 w-10 bg-accent/20 rounded-xl flex items-center justify-center">
            <Target className="h-5 w-5 text-accent" />
          </div>
          <div>
            <p className="text-xs text-muted uppercase">Objectifs actifs</p>
            <p className="text-xl font-bold">{stats.activeCount}</p>
          </div>
        </Card>

        <Card padding="sm" className="flex items-center gap-4">
          <div className="h-10 w-10 bg-secondary/20 rounded-xl flex items-center justify-center">
            <Calendar className="h-5 w-5 text-secondary" />
          </div>
          <div>
            <p className="text-xs text-muted uppercase">Prochain objectif</p>
            {stats.next ? (
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold truncate">{stats.next.name}</p>
                <Badge variant="outline" size="sm">{getCountdown(stats.next.event_date)}</Badge>
              </div>
            ) : (
              <p className="text-sm text-muted">Aucun objectif</p>
            )}
          </div>
        </Card>
      </div>

      {/* Objectives List */}
      {sortedObjectives.length === 0 ? (
        <Card className="text-center py-12">
          <Target className="h-12 w-12 text-muted mx-auto mb-4" />
          <h3 className="font-semibold mb-2">Pas encore d&apos;objectif</h3>
          <p className="text-sm text-muted mb-4">
            Créez votre premier objectif pour que le coach puisse adapter votre
            entraînement
          </p>
          <Button variant="primary" onClick={handleOpenCreate}>
            Créer un objectif
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedObjectives.map((obj) => {
            const countdown = getCountdown(obj.event_date);
            const isPast = countdown === "Passé";
            return (
              <Card
                key={obj.id}
                className={cn(isPast && "opacity-60")}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{obj.name}</h3>
                      <span
                        className={cn(
                          "text-xs font-semibold px-2 py-0.5 rounded-full",
                          priorityColors[obj.priority]
                        )}
                      >
                        {obj.priority}
                      </span>
                      <Badge variant="outline" size="sm">{countdown}</Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-sm text-muted">
                      <span>{obj.event_type}</span>
                      <span>•</span>
                      <span>{formatDate(obj.event_date)}</span>
                      {obj.target_time && (
                        <>
                          <span>•</span>
                          <span>Cible : {obj.target_time}</span>
                        </>
                      )}
                    </div>
                    {obj.notes && (
                      <p className="text-xs text-muted mt-1">{obj.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenEdit(obj)}
                      aria-label="Modifier"
                    >
                      <Edit2 className="h-5 w-5 text-foreground/70 hover:text-accent transition-colors" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget({ id: obj.id, name: obj.name })}
                      aria-label="Supprimer"
                      isLoading={isDeletingId === obj.id}
                    >
                      <Trash className="h-5 w-5 text-foreground/70 hover:text-error transition-colors" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? "Modifier l'objectif" : "Nouvel objectif"}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Nom de l'objectif"
            placeholder="Ex: Semi-marathon de Lyon"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Type d'événement"
              placeholder="Semi-marathon, 10km, Triathlon..."
              value={form.event_type}
              onChange={(e) => setForm((prev) => ({ ...prev, event_type: e.target.value }))}
            />
            <Input
              label="Date"
              type="date"
              value={form.event_date}
              onChange={(e) => setForm((prev) => ({ ...prev, event_date: e.target.value }))}
            />
          </div>
          <Select
            label="Priorité"
            value={form.priority}
            onChange={(value) => setForm((prev) => ({ ...prev, priority: value as "A" | "B" | "C" }))}
            options={priorityOptions}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Temps cible (optionnel)"
              placeholder="Ex: 1h45"
              value={form.target_time}
              onChange={(e) => setForm((prev) => ({ ...prev, target_time: e.target.value }))}
            />
          </div>
          <Input
            label="Notes (optionnel)"
            placeholder="Stratégie, contraintes, objectifs intermédiaires..."
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              isLoading={isSaving}
              disabled={!form.name || !form.event_date || !form.event_type}
            >
              {editingId ? "Mettre à jour" : "Créer"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <DeleteConfirmationModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        isLoading={Boolean(isDeletingId)}
        description={
          deleteTarget
            ? `Supprimer l'objectif "${deleteTarget.name}" est irrémédiable.`
            : undefined
        }
      />
    </div>
  );
}
