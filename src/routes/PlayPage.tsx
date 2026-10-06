import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccountStore } from "../store/accountStore";
import { useGameStore } from "../store/gameStore";
import { useInstanceStore } from "../store/instanceStore";

export function PlayPage() {
  const { instances, refresh } = useInstanceStore();
  const { active } = useAccountStore();
  const { launch, launchingId, runningId, progress, logs, error } = useGameStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sorted = useMemo(
    () =>
      [...instances].sort((a, b) => {
        const at = a.last_played ? new Date(a.last_played).getTime() : 0;
        const bt = b.last_played ? new Date(b.last_played).getTime() : 0;
        return bt - at;
      }),
    [instances],
  );

  const selected = sorted.find((i) => i.id === selectedId) ?? sorted[0] ?? null;
  const account = active();
  const isBusy = selected ? launchingId === selected.id || runningId === selected.id : false;

  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 p-6">
      <div className="text-center">
        {account ? (
          <>
            <img
              src={`https://mc-heads.net/body/${account.uuid}/160`}
              alt=""
              className="mx-auto h-52 drop-shadow-2xl"
            />
            <div className="text-2xl font-bold mt-2">{account.username}</div>
          </>
        ) : (
          <div className="text-text-muted">
            Connecte-toi depuis <Link to="/account" className="text-accent underline">Compte</Link> pour jouer.
          </div>
        )}
      </div>

      {sorted.length === 0 ? (
        <Link
          to="/instances"
          className="px-5 py-3 rounded-full bg-accent hover:bg-accent-hover active:scale-[0.98] transition-all font-medium"
        >
          Créer ta première instance
        </Link>
      ) : (
        <div className="w-full max-w-md flex flex-col gap-3">
          <select
            value={selected?.id ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
            className="bg-panel-2 border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {sorted.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} — {i.mc_version}
              </option>
            ))}
          </select>

          <button
            onClick={() => selected && launch(selected.id)}
            disabled={!account || !selected || isBusy}
            className="py-3 rounded-full bg-accent hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 font-semibold text-lg flex items-center justify-center gap-2"
          >
            {isBusy
              ? progress
                ? `${progress.stage} — ${Math.round((progress.completed / Math.max(progress.total, 1)) * 100)}%`
                : "Lancement..."
              : `Jouer ${selected?.mc_version ?? ""}`}
          </button>

          {error && <div className="text-sm text-red-400 text-center">{error}</div>}

          {logs.length > 0 && (
            <button
              onClick={() => setShowLogs((v) => !v)}
              className="text-xs text-text-muted hover:text-text self-center"
            >
              {showLogs ? "Masquer les logs" : "Afficher les logs"}
            </button>
          )}
        </div>
      )}

      {showLogs && (
        <div className="w-full max-w-2xl h-56 bg-black/40 border border-border rounded-2xl p-3 overflow-y-auto font-mono text-xs">
          {logs.map((l, idx) => (
            <div key={idx} className={l.stream === "stderr" ? "text-red-400" : "text-text-muted"}>
              {l.line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
