import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatBytes } from "../lib/format";
import type { Backup, World } from "../lib/types";
import { toast } from "../store/toastStore";
import { Icon, Spinner } from "./ui";

function formatWhen(ms: number) {
  return new Date(ms).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/// Mondes d'une instance et leurs sauvegardes : sauvegarder, restaurer, supprimer.
export function WorldBackups({ instanceId, running, reloadKey }: {
  instanceId: string;
  /// Le jeu tourne avec cette instance : on ne restaure pas un monde ouvert.
  running: boolean;
  /// Change quand les mondes ont pu être modifiés ailleurs (changement de version...).
  reloadKey?: number;
}) {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, b] = await Promise.all([api.listWorlds(instanceId), api.listBackups(instanceId)]);
      setWorlds(w);
      setBackups(b);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoaded(true);
    }
  }, [instanceId]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  const backup = (world: string) =>
    run(`backup:${world}`, async () => {
      await api.backupWorld(instanceId, world);
      toast.success(`Monde « ${world} » sauvegardé`);
    });

  const restore = (item: Backup) =>
    run(`restore:${item.file_name}`, async () => {
      await api.restoreBackup(instanceId, item.file_name);
      setConfirmRestore(null);
      toast.success(`« ${item.world} » restauré (l'ancienne version a été sauvegardée)`);
    });

  const remove = (item: Backup) =>
    run(`delete:${item.file_name}`, async () => {
      await api.deleteBackup(instanceId, item.file_name);
    });

  return (
    <section className="flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="section-title flex items-center gap-2">
          Mondes et sauvegardes
          {backups.length > 0 && <span className="badge">{backups.length}</span>}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={() => api.openInstanceFolder(instanceId, "saves").catch((e) => setError(String(e)))} className="btn btn-ghost btn-sm">
            <Icon name="folder" className="w-3.5 h-3.5" /> Mondes
          </button>
          <button onClick={() => api.openInstanceFolder(instanceId, "backups").catch((e) => setError(String(e)))} className="btn btn-ghost btn-sm">
            <Icon name="folder" className="w-3.5 h-3.5" /> Sauvegardes
          </button>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {!loaded ? (
        <div className="text-sm text-text-muted flex items-center gap-2">
          <Spinner className="w-4 h-4" /> Chargement...
        </div>
      ) : worlds.length === 0 && backups.length === 0 ? (
        <div className="empty-state py-8">
          <Icon name="box" className="w-7 h-7 text-text-faint" />
          <p className="text-sm">Aucun monde pour l'instant.</p>
          <p className="text-[11px] text-text-faint">Lance le jeu et crée un monde : il apparaîtra ici.</p>
        </div>
      ) : (
        <>
          {worlds.map((world) => (
            <div key={world.name} className="row">
              <div className="icon-tile w-10 h-10 flex items-center justify-center text-accent">
                <Icon name="globe" className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{world.name}</div>
                <div className="text-[11px] text-text-faint">
                  {formatBytes(world.size_bytes)} · joué le {formatWhen(world.modified_ms)}
                </div>
              </div>
              <button onClick={() => backup(world.name)} disabled={busy !== null} className="btn btn-secondary btn-sm">
                {busy === `backup:${world.name}` ? <Spinner className="w-3.5 h-3.5" /> : <Icon name="download" className="w-3.5 h-3.5" />}
                Sauvegarder
              </button>
            </div>
          ))}

          {backups.length > 0 && (
            <div className="flex flex-col gap-2 mt-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-faint">
                Sauvegardes · 10 gardées par monde
              </div>
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                {backups.map((item) => (
                  <div key={item.file_name} className="row">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{item.world}</div>
                      <div className="text-[11px] text-text-faint">
                        {formatWhen(item.created_ms)} · {formatBytes(item.size_bytes)}
                      </div>
                    </div>
                    {confirmRestore === item.file_name ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-text-muted hidden sm:inline">Remplacer le monde actuel ?</span>
                        <button onClick={() => restore(item)} disabled={busy !== null} className="btn btn-primary btn-sm">
                          {busy === `restore:${item.file_name}` && <Spinner className="w-3.5 h-3.5" />}
                          Restaurer
                        </button>
                        <button onClick={() => setConfirmRestore(null)} className="btn btn-ghost btn-sm">
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setConfirmRestore(item.file_name)}
                          disabled={busy !== null || running}
                          title={running ? "Ferme le jeu avant de restaurer un monde" : "Remplacer le monde par cette sauvegarde"}
                          className="btn btn-secondary btn-sm"
                        >
                          <Icon name="refresh" className="w-3.5 h-3.5" /> Restaurer
                        </button>
                        <button
                          onClick={() => remove(item)}
                          disabled={busy !== null}
                          className="btn btn-danger btn-sm w-8 p-0"
                          title="Supprimer cette sauvegarde"
                        >
                          <Icon name="trash" className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
