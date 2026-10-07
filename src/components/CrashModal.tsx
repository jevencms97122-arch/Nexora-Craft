import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AiReport } from "../lib/types";
import { useGameStore } from "../store/gameStore";
import { Icon, Modal, Spinner } from "./ui";

/// Diagnostic affiché quand le jeu s'arrête anormalement, ou à la demande depuis la console.
/// Les règles locales répondent d'abord ; l'IA peut ensuite être sollicitée pour aller plus loin.
export function CrashModal() {
  const crash = useGameStore((s) => s.crash);
  const logs = useGameStore((s) => s.logs);
  const instanceId = useGameStore((s) => s.lastInstanceId);
  const dismiss = useGameStore((s) => s.dismissCrash);
  const [showLogs, setShowLogs] = useState(false);
  const [aiReport, setAiReport] = useState<AiReport | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Chaque nouveau diagnostic repart d'une analyse vierge.
  useEffect(() => {
    setAiReport(null);
    setAiError(null);
    setAiLoading(false);
    setShowLogs(false);
  }, [crash]);

  if (!crash) return null;

  async function askAi() {
    setAiLoading(true);
    setAiError(null);
    try {
      setAiReport(await api.analyzeCrashWithAi(instanceId, logs.map((l) => l.line)));
    } catch (e) {
      setAiError(String(e));
    } finally {
      setAiLoading(false);
    }
  }

  // L'analyse de l'IA, une fois obtenue, remplace le diagnostic local à l'écran.
  const shown = aiReport ?? crash;
  const fromAi = aiReport !== null;

  return (
    <Modal onClose={dismiss} width={560}>
      <div className="flex items-start gap-4 mb-5">
        <div
          className={`w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center ${
            fromAi || crash.recognized ? "bg-accent/12 text-accent" : "bg-fg/8 text-text-muted"
          }`}
        >
          <Icon name={fromAi ? "sparkles" : crash.recognized ? "bulb" : "alert"} className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <div className="eyebrow mb-1">
            {fromAi ? "Analyse de l'IA" : crash.recognized ? "Cause identifiée" : "Diagnostic"}
          </div>
          <h2 className="section-title text-lg leading-snug">{shown.title}</h2>
        </div>
      </div>

      <div key={fromAi ? "ai" : "local"} className="rise">
        <p className="text-sm leading-relaxed">{shown.explanation}</p>

        {shown.suggestions.length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-2">Quoi faire</div>
            <ul className="flex flex-col gap-2 stagger">
              {shown.suggestions.map((s) => (
                <li key={s} className="row items-start py-2.5">
                  <Icon name="check" className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                  <span className="text-sm leading-relaxed">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {fromAi && (
          <p className="text-[11px] text-text-faint mt-3 leading-relaxed">
            Réponse générée par une IA à partir de tes journaux : elle peut se tromper.
          </p>
        )}
      </div>

      {crash.evidence && (
        <div className="mt-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-faint mb-2">
            Ligne du journal
          </div>
          <div className="terminal text-red-300 break-words">{crash.evidence}</div>
        </div>
      )}

      {/* Analyse par IA, à la demande. */}
      {!fromAi && logs.length > 0 && (
        <div className="mt-5 rounded-2xl border border-border-strong bg-fg/[0.03] p-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Icon name="sparkles" className="w-4 h-4 text-accent" />
              {crash.recognized ? "Besoin d'une explication plus poussée ?" : "Demander une analyse à l'IA"}
            </div>
            <p className="text-[11px] text-text-faint leading-relaxed mt-1">
              Envoie la fin des journaux et la configuration de l'instance (version, mods) à notre service
              d'analyse. Ton pseudo, ton nom de session Windows et les adresses IP sont retirés avant l'envoi.
            </p>
          </div>
          <button onClick={askAi} disabled={aiLoading} className="btn btn-secondary shrink-0">
            {aiLoading ? <Spinner /> : null}
            {aiLoading ? "Analyse..." : "Analyser"}
          </button>
        </div>
      )}
      {aiError && <div className="alert-error mt-3">{aiError}</div>}

      {showLogs && (
        <div className="terminal h-52 mt-3">
          {logs.slice(-120).map((l, i) => (
            <div key={i} className={l.stream === "stderr" ? "text-red-400" : undefined}>
              {l.line}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between gap-2 mt-6">
        {logs.length > 0 ? (
          <button onClick={() => setShowLogs((v) => !v)} className="btn btn-ghost">
            <Icon name="terminal" className="w-4 h-4" />
            {showLogs ? "Masquer les journaux" : "Voir les journaux"}
          </button>
        ) : (
          <span />
        )}
        <button onClick={dismiss} className="btn btn-primary">
          Compris
        </button>
      </div>
    </Modal>
  );
}
