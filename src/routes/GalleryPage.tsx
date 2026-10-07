import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Icon, PageHeader, Skeleton } from "../components/ui";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import type { Screenshot } from "../lib/types";
import { toast } from "../store/toastStore";

export function GalleryPage() {
  const [shots, setShots] = useState<Screenshot[] | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setShots(await api.listScreenshots());
    } catch (e) {
      setError(String(e));
      setShots([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const instances = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of shots ?? []) seen.set(s.instance_id, s.instance_name);
    return [...seen.entries()];
  }, [shots]);

  const visible = useMemo(
    () => (shots ?? []).filter((s) => filter === "all" || s.instance_id === filter),
    [shots, filter],
  );
  const current = openIndex !== null ? visible[openIndex] : null;

  // Navigation au clavier dans la visionneuse.
  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIndex(null);
      if (e.key === "ArrowRight") setOpenIndex((i) => (i === null ? i : Math.min(visible.length - 1, i + 1)));
      if (e.key === "ArrowLeft") setOpenIndex((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, visible.length]);

  async function handleDelete(shot: Screenshot) {
    try {
      await api.deleteScreenshot(shot.path);
      setOpenIndex(null);
      await load();
      toast.success("Capture supprimée");
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Souvenirs"
        title="Galerie"
        subtitle={
          shots && shots.length > 0
            ? `${shots.length} capture${shots.length > 1 ? "s" : ""} prises dans tes instances (touche F2 en jeu).`
            : "Toutes les captures d'écran de toutes tes instances, au même endroit."
        }
        actions={
          <button onClick={load} className="btn btn-secondary">
            <Icon name="refresh" className="w-4 h-4" /> Actualiser
          </button>
        }
      />

      {error && <div className="alert-error">{error}</div>}

      {instances.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setFilter("all")} className={`chip ${filter === "all" ? "chip-active" : ""}`}>
            Toutes
          </button>
          {instances.map(([id, name]) => (
            <button key={id} onClick={() => setFilter(id)} className={`chip ${filter === id ? "chip-active" : ""}`}>
              {name}
            </button>
          ))}
        </div>
      )}

      {shots === null ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="aspect-video !rounded-[20px]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent flex items-center justify-center mb-1">
            <Icon name="camera" className="w-7 h-7" />
          </div>
          <div className="section-title text-text">Aucune capture</div>
          <p className="text-sm max-w-xs">
            Appuie sur <span className="kbd">F2</span> en jeu pour prendre une capture : elle apparaîtra ici.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 stagger">
          {visible.map((shot, i) => (
            <button
              key={shot.path}
              onClick={() => setOpenIndex(i)}
              className="group relative card card-hover overflow-hidden aspect-video text-left"
            >
              <img
                src={convertFileSrc(shot.path)}
                alt={shot.file_name}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 px-3 py-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="text-xs font-semibold text-white truncate">{shot.instance_name}</div>
                <div className="text-[11px] text-white/70">{formatDate(shot.modified_ms)}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Visionneuse */}
      {current && (
        <div className="modal-backdrop flex-col gap-4 p-8" onClick={() => setOpenIndex(null)}>
          <img
            src={convertFileSrc(current.path)}
            alt={current.file_name}
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[calc(100vh-170px)] rounded-2xl shadow-2xl border border-border-strong"
            style={{ animation: "pop-in 0.18s ease-out" }}
          />
          <div
            className="liquid liquid-strong rounded-2xl px-4 py-2.5 flex items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpenIndex((i) => (i === null ? i : Math.max(0, i - 1)))}
              disabled={openIndex === 0}
              className="btn btn-ghost btn-sm w-8 p-0"
              title="Précédente"
            >
              <Icon name="back" className="w-4 h-4" />
            </button>
            <div className="text-xs min-w-0">
              <div className="font-semibold truncate max-w-[220px]">{current.instance_name}</div>
              <div className="text-text-faint">
                {formatDate(current.modified_ms)} · {(openIndex ?? 0) + 1} / {visible.length}
              </div>
            </div>
            <button
              onClick={() => setOpenIndex((i) => (i === null ? i : Math.min(visible.length - 1, i + 1)))}
              disabled={openIndex === visible.length - 1}
              className="btn btn-ghost btn-sm w-8 p-0"
              title="Suivante"
            >
              <Icon name="back" className="w-4 h-4 rotate-180" />
            </button>
            <span className="w-px h-6 bg-border-strong" />
            <button onClick={() => api.openScreenshot(current.path)} className="btn btn-secondary btn-sm">
              <Icon name="external" className="w-3.5 h-3.5" /> Ouvrir
            </button>
            <button onClick={() => api.openScreenshotsFolder(current.instance_id)} className="btn btn-secondary btn-sm">
              <Icon name="folder" className="w-3.5 h-3.5" /> Dossier
            </button>
            <button onClick={() => handleDelete(current)} className="btn btn-danger btn-sm">
              <Icon name="trash" className="w-3.5 h-3.5" /> Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
