import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AccountSkin3D } from "../components/AccountSkin";
import { ChristmasCountdown } from "../components/ChristmasSeason";
import { Dropdown, Icon, ProgressBar, Spinner, progressPercent } from "../components/ui";
import { api } from "../lib/api";
import type { Renderer, Server, ServerStatus } from "../lib/types";
import { useAccountStore } from "../store/accountStore";
import { useGameStore } from "../store/gameStore";

const REFRESH_MS = 30_000;
/// Dernier rendu choisi (OpenGL ou Vulkan), gardé d'une ouverture du launcher à l'autre.
const RENDERER_KEY = "nexora.smp.renderer";

const RENDERERS: { value: Renderer; label: string; hint: string }[] = [
  { value: "opengl", label: "OpenGL", hint: "Rendu classique de Minecraft, le plus compatible" },
  { value: "vulkan", label: "Vulkan", hint: "VulkanMod : souvent plus de FPS, carte graphique compatible Vulkan requise" },
];

function savedRenderer(): Renderer {
  return localStorage.getItem(RENDERER_KEY) === "vulkan" ? "vulkan" : "opengl";
}

/// Page « Nexora SMP » : le serveur officiel, un seul bouton Jouer qui installe ce qu'il faut puis
/// rejoint directement le serveur. Le sélecteur du bas ne contient que Nexora SMP.
export function SmpPage() {
  const account = useAccountStore((s) => s.active());
  const { joinOfficial, preparingOfficial, officialProgress, launchingId, runningId, progress, error } = useGameStore();
  const [server, setServer] = useState<Server | null>(null);
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [renderer, setRenderer] = useState<Renderer>(savedRenderer);

  function chooseRenderer(value: Renderer) {
    setRenderer(value);
    localStorage.setItem(RENDERER_KEY, value);
  }

  useEffect(() => {
    api
      .listServers()
      .then((list) => setServer(list.find((s) => s.official) ?? null))
      .catch(() => setServer(null));
  }, []);

  useEffect(() => {
    if (!server) return;
    let alive = true;
    const ping = () =>
      api
        .pingServer(server.address)
        .then((s) => alive && setStatus(s))
        .catch(() => alive && setStatus(null));
    ping();
    const timer = setInterval(ping, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [server]);

  const isRunning = !!runningId;
  const isLaunching = preparingOfficial || (!!launchingId && !isRunning);
  const percent = preparingOfficial
    ? officialProgress && officialProgress.total > 0
      ? Math.round((officialProgress.done / officialProgress.total) * 100)
      : null
    : progressPercent(progress);
  const stage = preparingOfficial ? (officialProgress?.title ?? "Préparation du serveur...") : (progress?.stage ?? "Lancement...");
  const online = !!status?.online;

  return (
    <div className="relative min-h-full w-full box-border flex flex-col pt-6 pb-8 gap-8">
      <section className="flex-1 flex items-center gap-12 min-h-[380px] w-full max-w-[1480px] mx-auto px-10 box-border">
        <div className="flex flex-col gap-7 w-full max-w-xl shrink min-w-0">
          <div>
            <div className="eyebrow mb-3 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${online ? "bg-accent animate-pulse" : "bg-fg/30"}`} />
              {online ? `${status?.players_online ?? 0} / ${status?.players_max ?? 0} joueurs en ligne` : "Serveur officiel"}
            </div>
            <h1
              className="relative text-[52px] leading-[1.05] font-extrabold tracking-[-0.02em]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Nexora{" "}
              <span className="bg-gradient-to-r from-[#ff4d5a] via-[#ffd27a] to-[#3ddc84] bg-clip-text text-transparent pb-1">
                SMP
              </span>
            </h1>
            <p className="text-text-muted mt-3">
              Clique sur Jouer : le launcher prépare tout et te connecte directement au serveur.
            </p>
          </div>

          <ChristmasCountdown />

          {!account ? (
            <Link to="/account" className="btn btn-primary btn-shine self-start">
              <Icon name="user" className="w-4 h-4" /> Se connecter pour jouer
            </Link>
          ) : (
            <div className="liquid relative z-30 rounded-3xl p-3 flex flex-col gap-3 shadow-[0_30px_80px_-30px_var(--glass-shadow)]">
              <div className="flex items-center gap-3">
                {/* Sélecteur façon Paladium : il n'y a qu'un seul serveur, le reste est vide. */}
                <Dropdown
                  className="flex-1 min-w-0"
                  placement="up"
                  ariaLabel="Choisir le serveur"
                  value="nexora-smp"
                  onChange={() => {}}
                  options={[
                    { value: "nexora-smp", label: "Nexora SMP", hint: server?.address ? "Serveur officiel" : undefined },
                  ]}
                  trigger={
                    <div className="flex items-center gap-3 px-2 py-1.5 rounded-2xl hover:bg-fg/5 transition-colors">
                      <span className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center shrink-0">
                        <Icon name="globe" className="w-5 h-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">Nexora SMP</div>
                        <div className="text-xs text-text-muted">{online ? "En ligne" : "Serveur officiel"}</div>
                      </div>
                      <Icon name="chevronDown" className="w-4 h-4 text-text-muted" />
                    </div>
                  }
                />
                <button
                  onClick={() => server && joinOfficial(server.address, renderer)}
                  disabled={!server || isLaunching || isRunning}
                  className="btn btn-primary btn-shine h-14 px-9 rounded-2xl text-base font-extrabold tracking-wider uppercase disabled:opacity-100 disabled:cursor-default"
                >
                  {isRunning ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-accent-ink animate-pulse" /> En jeu
                    </>
                  ) : isLaunching ? (
                    <>
                      <Spinner /> Lancement
                    </>
                  ) : (
                    <>
                      <Icon name="play" filled className="w-5 h-5" /> Jouer
                    </>
                  )}
                </button>
              </div>
              {/* Rendu du jeu : chaque choix lance sa propre instance (OpenGL ou Vulkan). */}
              <div className="flex items-center gap-3 px-2">
                <span className="text-xs text-text-muted">Rendu</span>
                <div className="flex rounded-xl bg-panel-2 border border-border-strong p-1" role="radiogroup" aria-label="Rendu du jeu">
                  {RENDERERS.map((r) => (
                    <button
                      key={r.value}
                      role="radio"
                      aria-checked={renderer === r.value}
                      title={r.hint}
                      onClick={() => chooseRenderer(r.value)}
                      disabled={isLaunching || isRunning}
                      className={`px-3 h-7 rounded-lg text-xs font-semibold transition-colors disabled:cursor-default ${
                        renderer === r.value ? "bg-accent text-accent-ink" : "text-text-muted hover:text-text"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              {isLaunching && (
                <div className="px-2 pb-1 flex flex-col gap-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted truncate">{stage}</span>
                    {percent !== null && <span className="text-accent font-semibold tabular-nums">{percent}%</span>}
                  </div>
                  <ProgressBar value={percent} />
                </div>
              )}
            </div>
          )}

          {error && <div className="alert-error">{error}</div>}
        </div>

        {account && (
          <div className="relative hidden lg:flex flex-col items-center shrink-0 skin-in" style={{ animationDelay: "0.2s" }}>
            <div className="absolute top-1/4 w-56 h-56 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative z-10 drop-shadow-[0_14px_22px_rgba(0,0,0,0.55)]">
              <AccountSkin3D account={account} height={320} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
