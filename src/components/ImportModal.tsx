import { useEffect, useState } from "react";
import type { ImportKind, ImportVerdict } from "../lib/types";
import { api } from "../lib/api";
import { useImportStore } from "../store/importStore";
import { useInstanceStore } from "../store/instanceStore";
import { toast } from "../store/toastStore";
import { Icon, InstanceIcon, Modal, Spinner, loaderLabel, type IconName } from "./ui";

const KINDS: Record<ImportKind, { label: string; icon: IconName }> = {
  mod: { label: "Mod", icon: "box" },
  resourcepack: { label: "Pack de ressources", icon: "image" },
  shader: { label: "Shader", icon: "sparkles" },
  datapack: { label: "Datapack", icon: "folder" },
  modpack: { label: "Modpack CurseForge", icon: "grid" },
  unknown: { label: "Fichier non reconnu", icon: "alert" },
};

const VERDICTS: Record<ImportVerdict, { label: string; className: string }> = {
  ok: { label: "Compatible", className: "text-accent" },
  unknown: { label: "À vérifier", className: "text-text-muted" },
  no: { label: "Incompatible", className: "text-danger" },
};

const ORDER: Record<ImportVerdict, number> = { ok: 0, unknown: 1, no: 2 };

/// Fenêtre affichée quand un fichier téléchargé vient d'être détecté : dans quelle instance
/// l'installer, et s'il est compatible avec chacune.
export function ImportModal() {
  const file = useImportStore((s) => s.queue[0]);
  const remaining = useImportStore((s) => s.queue.length - 1);
  const dismiss = useImportStore((s) => s.dismiss);
  const { instances, refresh } = useInstanceStore();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (file) refresh();
  }, [file, refresh]);

  if (!file) return null;

  const kind = KINDS[file.kind];
  const rows = file.compat
    .map((c) => ({ ...c, instance: instances.find((i) => i.id === c.instance_id) }))
    .filter((row) => row.instance)
    .sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict]);
  const installable = rows.some((row) => row.verdict !== "no");

  async function install(instanceId: string, name: string) {
    if (!file) return;
    setBusy(instanceId);
    try {
      await api.installDownload(file.path, instanceId);
      toast.success(`${file.title} installé dans ${name}`);
      dismiss();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal onClose={dismiss} width={540}>
      <div className="eyebrow mb-2">Fichier téléchargé détecté</div>
      <div className="flex items-start gap-3 mb-5">
        <div className="icon-tile w-12 h-12 flex items-center justify-center text-accent shrink-0">
          <Icon name={kind.icon} className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <h2 className="section-title text-lg truncate">{file.title}</h2>
          <div className="text-xs text-text-muted truncate">{file.file_name}</div>
          <div className="flex gap-1.5 flex-wrap mt-2">
            <span className="badge badge-accent">{kind.label}</span>
            {file.loaders.map((loader) => (
              <span key={loader} className="badge">
                {loaderLabel(loader)}
              </span>
            ))}
            {file.minecraft && <span className="badge">Minecraft {file.minecraft}</span>}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state">
          <p className="text-sm">Tu n'as encore aucune instance. Crée-en une, puis retélécharge le fichier.</p>
        </div>
      ) : (
        <>
          <div className="label">{installable ? "Dans quelle instance l'installer ?" : "Aucune instance ne convient"}</div>
          <div className="flex flex-col gap-2 max-h-[46vh] overflow-y-auto -mr-2 pr-2">
            {rows.map(({ instance, verdict, reason }) => (
              <div key={instance!.id} className={`row ${verdict === "no" ? "opacity-60" : ""} !cursor-default`}>
                <InstanceIcon name={instance!.name} icon={instance!.icon} className="w-10 h-10 text-base" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{instance!.name}</div>
                  <div className="text-[11px] text-text-faint truncate">
                    {instance!.mc_version} · {loaderLabel(instance!.loader)}
                  </div>
                  <div className={`text-[11px] mt-0.5 ${VERDICTS[verdict].className}`}>
                    {VERDICTS[verdict].label} : {reason}
                  </div>
                </div>
                {verdict !== "no" && (
                  <button
                    onClick={() => install(instance!.id, instance!.name)}
                    disabled={busy !== null}
                    className={`btn btn-sm ${verdict === "ok" ? "btn-primary" : "btn-secondary"}`}
                  >
                    {busy === instance!.id ? <Spinner className="w-3.5 h-3.5" /> : <Icon name="download" className="w-3.5 h-3.5" />}
                    {verdict === "ok" ? "Installer" : "Installer quand même"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-3 mt-5">
        <span className="text-[11px] text-text-faint">
          {remaining > 0
            ? `${remaining} autre${remaining > 1 ? "s" : ""} fichier${remaining > 1 ? "s" : ""} en attente`
            : "Le fichier reste dans ton dossier Téléchargements."}
        </span>
        <button onClick={dismiss} className="btn btn-ghost">
          Ignorer
        </button>
      </div>
    </Modal>
  );
}
