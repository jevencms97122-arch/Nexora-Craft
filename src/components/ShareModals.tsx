import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import type { ImportProgress, ImportResult, Instance, SharedInstance } from "../lib/types";
import { useInstanceStore } from "../store/instanceStore";
import { toast } from "../store/toastStore";
import { Icon, InstanceIcon, Modal, ProgressBar, Spinner, loaderLabel } from "./ui";

/// Affiche le code de partage d'une instance, prêt à être copié.
export function ShareCodeModal({ instance, onClose }: { instance: Instance; onClose: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.exportInstanceCode(instance.id).then(setCode).catch((e) => setError(String(e)));
  }, [instance.id]);

  async function copy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    toast.success("Code copié");
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Modal onClose={onClose} width={520}>
      <div className="flex items-center gap-4 mb-5">
        <InstanceIcon name={instance.name} icon={instance.icon} className="w-14 h-14 text-2xl" />
        <div className="min-w-0">
          <div className="eyebrow mb-1">Partager</div>
          <h2 className="section-title text-lg truncate">{instance.name}</h2>
        </div>
      </div>

      <p className="text-sm text-text-muted leading-relaxed">
        Envoie ce code à un ami : il le colle dans <span className="text-text">Instances → Importer un code</span> et
        récupère la même version et les mêmes mods.
      </p>

      {error ? (
        <div className="alert-error mt-4">{error}</div>
      ) : code ? (
        <textarea
          readOnly
          value={code}
          onFocus={(e) => e.target.select()}
          className="input h-32 py-3 mt-4 font-mono text-xs leading-relaxed resize-none break-all"
        />
      ) : (
        <div className="flex items-center gap-2 text-text-muted py-8 justify-center">
          <Spinner /> Génération du code...
        </div>
      )}

      <p className="text-[11px] text-text-faint mt-2 leading-relaxed">
        Le code contient la version, le loader et les contenus installés depuis Modrinth. Les mondes, les réglages
        et les fichiers ajoutés à la main ne sont pas inclus.
      </p>

      <div className="flex justify-end gap-2 mt-6">
        <button onClick={onClose} className="btn btn-ghost">
          Fermer
        </button>
        <button onClick={copy} disabled={!code} className="btn btn-primary">
          <Icon name={copied ? "check" : "copy"} className="w-4 h-4" />
          {copied ? "Copié" : "Copier le code"}
        </button>
      </div>
    </Modal>
  );
}

/// Colle un code de partage, montre ce qu'il contient, puis recrée l'instance.
export function ImportCodeModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const refresh = useInstanceStore((s) => s.refresh);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<SharedInstance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    const unlisten = listen<ImportProgress>("share-progress", (e) => setProgress(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Aperçu dès qu'un code est collé.
  useEffect(() => {
    setPreview(null);
    setError(null);
    if (!code.trim()) return;
    let cancelled = false;
    api
      .previewInstanceCode(code)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setName(p.name);
      })
      .catch((e) => !cancelled && setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function handleImport() {
    setImporting(true);
    setError(null);
    try {
      const res = await api.importInstanceCode(code, name);
      await refresh();
      if (res.failed.length === 0) {
        toast.success(`Instance « ${res.instance.name} » importée`);
        onClose();
        navigate(`/instances/${res.instance.id}`);
      } else {
        setResult(res);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  }

  if (result) {
    return (
      <Modal onClose={onClose} width={520}>
        <div className="eyebrow mb-1">Import terminé</div>
        <h2 className="section-title text-lg mb-3">{result.instance.name}</h2>
        <p className="text-sm text-text-muted">
          L'instance est créée, mais {result.failed.length} contenu{result.failed.length > 1 ? "s" : ""} n'
          {result.failed.length > 1 ? "ont" : "a"} pas pu être installé{result.failed.length > 1 ? "s" : ""} :
        </p>
        <div className="terminal max-h-40 mt-3">
          {result.failed.map((f) => (
            <div key={f}>{f}</div>
          ))}
        </div>
        <div className="flex justify-end mt-6">
          <button
            onClick={() => {
              onClose();
              navigate(`/instances/${result.instance.id}`);
            }}
            className="btn btn-primary"
          >
            Ouvrir l'instance
          </button>
        </div>
      </Modal>
    );
  }

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <Modal onClose={importing ? () => {} : onClose} width={520}>
      <div className="eyebrow mb-1">Partage</div>
      <h2 className="section-title text-lg mb-4">Importer un code</h2>

      <label className="label">Code reçu</label>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="NXC1-..."
        disabled={importing}
        autoFocus
        className="input h-24 py-3 font-mono text-xs leading-relaxed resize-none break-all"
      />

      {error && <div className="alert-error mt-3">{error}</div>}

      {preview && (
        <div className="mt-4 flex flex-col gap-4 rise">
          <div className="row">
            <InstanceIcon name={name || preview.name} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{preview.name}</div>
              <div className="text-xs text-text-muted">
                {preview.mc_version} · {loaderLabel(preview.loader)}
                {preview.loader_version ? ` ${preview.loader_version}` : ""}
              </div>
            </div>
            <span className="badge badge-accent">
              {preview.items.length} contenu{preview.items.length > 1 ? "s" : ""}
            </span>
          </div>
          <div>
            <label className="label">Nom de l'instance</label>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={importing} className="input" />
          </div>
        </div>
      )}

      {importing && (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex justify-between text-xs">
            <span className="text-text-muted truncate">{progress?.title || "Création de l'instance..."}</span>
            {progress && progress.total > 0 && (
              <span className="text-accent font-semibold tabular-nums">
                {progress.done} / {progress.total}
              </span>
            )}
          </div>
          <ProgressBar value={percent} />
        </div>
      )}

      <div className="flex justify-end gap-2 mt-6">
        <button onClick={onClose} disabled={importing} className="btn btn-ghost">
          Annuler
        </button>
        <button onClick={handleImport} disabled={!preview || importing || !name.trim()} className="btn btn-primary">
          {importing ? <Spinner /> : <Icon name="download" className="w-4 h-4" />}
          {importing ? "Import en cours" : "Créer l'instance"}
        </button>
      </div>
    </Modal>
  );
}
