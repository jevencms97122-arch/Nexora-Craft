import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import { isValidUsername } from "../lib/format";
import type { ImportProgress, Instance, Server, ServerStatus } from "../lib/types";
import { useAccountStore } from "../store/accountStore";
import { useGameStore } from "../store/gameStore";
import { useInstanceStore } from "../store/instanceStore";
import { Wordmark } from "./Logo";
import { AnimatedText, Icon, InstanceIcon, Spinner } from "./ui";

const ONBOARDED_KEY = "nexora.onboarded";

/// Vrai tant que le parcours de premier lancement n'a pas été terminé ou passé.
export function needsOnboarding() {
  try {
    return localStorage.getItem(ONBOARDED_KEY) !== "1";
  } catch {
    return false;
  }
}

function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    // Stockage indisponible : le parcours sera simplement proposé de nouveau.
  }
}

const STEPS = ["Ton pseudo", "Ton instance", "Le serveur"];

/// Parcours de premier lancement : créer son compte, préparer son instance, rejoindre le serveur.
export function Onboarding({ onDone }: { onDone: () => void }) {
  const { loginOffline, error: accountError } = useAccountStore();
  const refreshInstances = useInstanceStore((s) => s.refresh);
  const launch = useGameStore((s) => s.launch);
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instance, setInstance] = useState<Instance | null>(null);
  const [server, setServer] = useState<Server | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [packProgress, setPackProgress] = useState<ImportProgress | null>(null);

  // Avancement de l'installation du pack pendant la création de l'instance.
  useEffect(() => {
    const unlisten = listen<ImportProgress>("share-progress", (e) => setPackProgress(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    api
      .listServers()
      .then((list) => {
        const official = list.find((s) => s.official) ?? null;
        setServer(official);
        if (official) api.pingServer(official.address).then(setStatus).catch(() => {});
      })
      .catch(() => {});
  }, []);

  function finish() {
    markOnboarded();
    onDone();
  }

  async function createAccount() {
    if (!isValidUsername(username)) return;
    setBusy(true);
    setError(null);
    await loginOffline(username);
    setBusy(false);
    // loginOffline range son erreur dans le store plutôt que de la lever.
    if (!useAccountStore.getState().error) setStep(1);
  }

  async function createInstance() {
    setBusy(true);
    setError(null);
    try {
      setInstance(await api.ensureOfficialInstance());
      await refreshInstances();
      setStep(2);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function join() {
    if (instance && server) launch(instance.id, server.address);
    finish();
  }

  const shownError = error ?? (step === 0 ? accountError : null);
  const serverName = server?.name ?? "le serveur";

  return (
    <div className="modal-backdrop" style={{ background: "color-mix(in srgb, var(--color-bg) 72%, transparent)" }}>
      <div className="modal" style={{ width: 520 }}>
        <Wordmark size={34} className="mb-6" />
        {/* Progression */}
        <div className="flex items-center gap-2 mb-7">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1">
              <div className={`h-1 rounded-full transition-colors duration-500 ${i <= step ? "bg-accent" : "bg-fg/10"}`} />
              <div className={`text-[11px] mt-1.5 font-medium ${i === step ? "text-text" : "text-text-faint"}`}>
                {i + 1}. {label}
              </div>
            </div>
          ))}
        </div>

        <div key={step} className="stagger flex flex-col gap-4">
          {step === 0 && (
            <>
              <div>
                <div className="eyebrow mb-2">Bienvenue</div>
                <h2 className="page-title">
                  <AnimatedText text="Bienvenue sur Nexora Craft" delay={0.1} />
                </h2>
                <p className="text-text-muted mt-3 leading-relaxed">
                  Trois étapes et tu es en jeu. Commence par choisir ton pseudo : c'est le nom que les autres
                  joueurs verront.
                </p>
              </div>
              <div>
                <label className="label">Ton pseudo</label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && createAccount()}
                  placeholder="ex: Jux"
                  maxLength={16}
                  autoFocus
                  className="input h-12 text-base"
                />
                <p className="text-[11px] text-text-faint mt-2">3 à 16 caractères : lettres, chiffres et « _ ».</p>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <div className="eyebrow mb-2">Étape 2</div>
                <h2 className="page-title">
                  <AnimatedText text="Ton instance de jeu" delay={0.1} />
                </h2>
                <p className="text-text-muted mt-3 leading-relaxed">
                  Une instance, c'est une installation de Minecraft avec sa version et ses mods. On t'en prépare
                  une avec le pack de mods de {serverName} : la bonne version, les mods et les shaders.
                </p>
              </div>
              <div className="row">
                <InstanceIcon name={server?.name ?? "Nexora-SMP"} className="w-12 h-12 text-xl" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{server?.name ?? "Nexora-SMP"}</div>
                  <div className="text-xs text-text-muted">
                    Version, mods et shaders installés automatiquement
                  </div>
                </div>
                <span className="badge badge-accent">Recommandé</span>
              </div>
              <p className="text-[11px] text-text-faint leading-relaxed">
                Tu pourras créer d'autres instances plus tard (autres versions, mods, modpacks) depuis l'onglet
                Instances.
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <div className="eyebrow mb-2">Tout est prêt</div>
                <h2 className="page-title">
                  <AnimatedText text={`Rejoins ${serverName}`} delay={0.1} />
                </h2>
                <p className="text-text-muted mt-3 leading-relaxed">
                  Le jeu va se télécharger au premier lancement (quelques minutes selon ta connexion), puis tu
                  arriveras directement sur le serveur.
                </p>
              </div>
              {server && (
                <div className="row">
                  {status?.online && status.favicon ? (
                    <img src={status.favicon} alt="" className="icon-tile w-12 h-12" style={{ imageRendering: "pixelated" }} />
                  ) : (
                    <div className="icon-tile w-12 h-12 flex items-center justify-center text-accent">
                      <Icon name="globe" className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{server.name}</div>
                    <div className="text-xs text-text-muted truncate">
                      {status?.online && status.motd ? status.motd.split("\n")[0] : server.address}
                    </div>
                  </div>
                  {status === null ? (
                    <Spinner className="w-4 h-4 text-text-muted" />
                  ) : status.online ? (
                    <span className="text-xs text-accent font-semibold whitespace-nowrap flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                      {status.players_online} / {status.players_max}
                    </span>
                  ) : (
                    <span className="text-xs text-text-faint">Hors ligne</span>
                  )}
                </div>
              )}
            </>
          )}

          {shownError && <div className="alert-error">{shownError}</div>}

          <div className="flex items-center justify-between gap-2 pt-2">
            <button onClick={finish} disabled={busy} className="btn btn-ghost">
              {step === 2 ? "Plus tard" : "Passer"}
            </button>
            {step === 0 && (
              <button onClick={createAccount} disabled={busy || !isValidUsername(username)} className="btn btn-primary btn-shine h-11 px-6">
                {busy ? <Spinner /> : null}
                Continuer
              </button>
            )}
            {step === 1 && (
              <button onClick={createInstance} disabled={busy} className="btn btn-primary btn-shine h-11 px-6">
                {busy ? <Spinner /> : <Icon name="plus" className="w-4 h-4" />}
                {busy
                  ? packProgress && packProgress.total > 0
                    ? `Installation ${packProgress.done} / ${packProgress.total}`
                    : "Préparation"
                  : "Créer mon instance"}
              </button>
            )}
            {step === 2 && (
              <button onClick={join} disabled={!instance || !server} className="btn btn-primary btn-shine h-11 px-6">
                <Icon name="play" filled className="w-4 h-4" />
                Rejoindre maintenant
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
