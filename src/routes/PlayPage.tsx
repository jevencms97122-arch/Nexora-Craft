import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AccountSkin3D } from "../components/AccountSkin";
import { HomeCarousel } from "../components/HomeCarousel";
import { HomeFriends } from "../components/HomeFriends";
import {
  AnimatedText,
  Dropdown,
  Icon,
  InstanceIcon,
  ProgressBar,
  Spinner,
  instanceBanner,
  loaderLabel,
  progressPercent,
} from "../components/ui";
import { useAccountStore } from "../store/accountStore";
import { useGameStore } from "../store/gameStore";
import { useInstanceStore } from "../store/instanceStore";

function timeAgo(date: string | null) {
  if (!date) return "Jamais lancée";
  const minutes = Math.round((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `Il y a ${days} j`;
}

export function PlayPage() {
  const { instances, refresh } = useInstanceStore();
  const { active } = useAccountStore();
  const { launch, launchingId, runningId, progress, logs, error, diagnose } = useGameStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Un lancement démarré ailleurs (widget du serveur, onglet Multi) : on affiche cette instance
  // pour que sa progression soit visible ici.
  useEffect(() => {
    if (launchingId) setSelectedId(launchingId);
  }, [launchingId]);

  useEffect(() => {
    if (showLogs) logsEndRef.current?.scrollIntoView({ block: "end" });
  }, [logs, showLogs]);

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
  const isLaunching = !!selected && launchingId === selected.id && runningId !== selected.id;
  const isRunning = !!selected && runningId === selected.id;
  const percent = progressPercent(progress);

  return (
    <div className="relative min-h-full w-full box-border flex flex-col pt-6 pb-8 gap-8">
      <div className="absolute top-4 right-5 z-20 rise" style={{ animationDelay: "0.6s" }}>
        <HomeFriends />
      </div>
      {/* Hero */}
      {/* Le skin se tient juste à côté du titre ; la moitié droite reste libre pour la scène. */}
      <section className="flex-1 flex items-center gap-12 min-h-[380px] w-full max-w-[1480px] mx-auto px-10 box-border">
        <div className="flex flex-col gap-7 w-full max-w-xl shrink min-w-0">
          <div>
            <div className="eyebrow mb-3">{isRunning ? "Partie en cours" : "Prêt à jouer"}</div>
            {account ? (
              <h1
                className="text-[44px] leading-[1.08] font-bold tracking-[-0.02em]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                <AnimatedText text="Salut," delay={0.1} />{" "}
                <span
                  className="word bg-gradient-to-r from-accent to-cyan bg-clip-text text-transparent pb-1"
                  style={{ animationDelay: "0.22s" }}
                >
                  {account.username}
                </span>
              </h1>
            ) : (
              <>
                <h1 className="text-[38px] leading-tight font-bold tracking-[-0.02em]" style={{ fontFamily: "var(--font-display)" }}>
                  <AnimatedText text="Bienvenue sur Nexora" delay={0.1} />
                </h1>
                <p className="text-text-muted mt-3 rise" style={{ animationDelay: "0.4s" }}>
                  Connecte un compte pour lancer tes parties.
                </p>
                <Link to="/account" className="btn btn-primary btn-shine mt-5 rise" style={{ animationDelay: "0.5s" }}>
                  <Icon name="user" className="w-4 h-4" /> Se connecter
                </Link>
              </>
            )}
          </div>

          {account && sorted.length === 0 && (
            <div className="liquid rounded-3xl p-6 flex flex-col gap-4 rise" style={{ animationDelay: "0.35s" }}>
              <div>
                <div className="section-title">Aucune instance</div>
                <p className="text-text-muted text-sm mt-1">
                  Crée ta première instance pour choisir une version et des mods.
                </p>
              </div>
              <Link to="/instances" className="btn btn-primary self-start">
                <Icon name="plus" className="w-4 h-4" /> Créer une instance
              </Link>
            </div>
          )}

          {account && selected && (
            <div
              className="liquid relative z-30 rounded-3xl p-3 flex flex-col gap-3 shadow-[0_30px_80px_-30px_var(--glass-shadow)] rise"
              style={{ animationDelay: "0.35s" }}
            >
              <div className="flex items-center gap-3">
                <Dropdown
                  className="flex-1 min-w-0"
                  ariaLabel="Choisir l'instance"
                  value={selected.id}
                  onChange={setSelectedId}
                  options={sorted.map((i) => ({
                    value: i.id,
                    label: i.name,
                    hint: `${i.mc_version} · ${loaderLabel(i.loader)}`,
                    icon: <InstanceIcon name={i.name} icon={i.icon} className="w-9 h-9 text-sm" />,
                  }))}
                  trigger={
                    <div className="flex items-center gap-3 px-2 py-1.5 rounded-2xl hover:bg-fg/5 transition-colors">
                      <InstanceIcon name={selected.name} icon={selected.icon} />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{selected.name}</div>
                        <div className="text-xs text-text-muted">
                          {selected.mc_version} · {loaderLabel(selected.loader)}
                        </div>
                      </div>
                      <Icon name="chevronDown" className="w-4 h-4 text-text-muted" />
                    </div>
                  }
                />

                <button
                  onClick={() => launch(selected.id)}
                  disabled={isLaunching || isRunning}
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

              {isLaunching && (
                <div className="px-2 pb-1 flex flex-col gap-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted truncate">{progress?.stage ?? "Préparation..."}</span>
                    {percent !== null && <span className="text-accent font-semibold tabular-nums">{percent}%</span>}
                  </div>
                  <ProgressBar value={percent} />
                </div>
              )}
            </div>
          )}

          {error && <div className="alert-error">{error}</div>}

          {logs.length > 0 && (
            <div className="flex gap-1 -ml-3">
              <button onClick={() => setShowLogs((v) => !v)} className="btn btn-ghost btn-sm">
                <Icon name="terminal" className="w-4 h-4" />
                {showLogs ? "Masquer la console" : "Afficher la console"}
              </button>
              <button onClick={diagnose} className="btn btn-ghost btn-sm" title="Chercher une erreur connue dans les journaux">
                <Icon name="bulb" className="w-4 h-4" />
                Analyser un problème
              </button>
            </div>
          )}
        </div>

        {account && (
          <div className="relative hidden lg:flex flex-col items-center shrink-0 skin-in" style={{ animationDelay: "0.2s" }}>
            <div className="absolute top-1/4 w-56 h-56 rounded-full bg-accent/10 blur-3xl" />
            <div className="relative z-10 drop-shadow-[0_14px_22px_rgba(0,0,0,0.55)]">
              <AccountSkin3D account={account} height={320} />
            </div>
            {/* Socle lumineux : deux anneaux et un halo, sous les pieds du personnage. */}
            <div className="relative -mt-7 w-52 h-14" aria-hidden>
              <div className="absolute inset-x-0 bottom-0 h-10 rounded-[50%] bg-accent/30 blur-xl" />
              <div className="absolute inset-0 rounded-[50%] border border-accent/45 bg-accent/10 shadow-[inset_0_0_18px_var(--color-accent)]" />
              <div className="absolute inset-x-6 inset-y-2.5 rounded-[50%] border border-accent/60 bg-accent/15" />
            </div>
          </div>
        )}
      </section>

      {showLogs && (
        <div className="w-full max-w-[1480px] mx-auto px-10 box-border">
        <div className="terminal h-56">
          {logs.map((l, idx) => (
            <div key={idx} className={l.stream === "stderr" ? "text-red-400" : "text-text-muted"}>
              {l.line}
            </div>
          ))}
          <div ref={logsEndRef} />
        </div>
        </div>
      )}

      {/* Bas de page : instances récentes à gauche ; bandeau (serveur officiel et actualités) à droite. */}
      {/* Cette rangée prend toute la largeur : le bandeau reste collé au bord droit de la fenêtre, même
          en plein écran, tandis que les instances restent alignées sur le titre. */}
      <div
        className="flex items-end gap-4 rise pr-5 pl-[max(2.5rem,calc((100%_-_1480px)/2_+_2.5rem))]"
        style={{ animationDelay: "0.5s" }}
      >
      {account && sorted.length > 1 && (
        <section className="flex flex-col gap-3 flex-1 min-w-0">
          <div className="flex items-baseline gap-4">
            <h2 className="section-title">Récemment jouées</h2>
            <Link to="/instances" className="text-xs text-text-muted hover:text-accent transition-colors">
              Tout voir →
            </Link>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,220px))] gap-3 stagger">
            {sorted.slice(0, 4).map((i) => (
              <button
                key={i.id}
                onClick={() => setSelectedId(i.id)}
                className={`liquid card-hover rounded-[20px] overflow-hidden text-left ${
                  selected?.id === i.id ? "!border-accent/60" : ""
                }`}
              >
                <div className="h-14 relative" style={instanceBanner(i)}>
                  {runningId === i.id && (
                    <span className="absolute top-2 right-2 badge badge-accent">En jeu</span>
                  )}
                </div>
                <div className="p-3">
                  <div className="font-semibold truncate">{i.name}</div>
                  <div className="text-xs text-text-muted mt-0.5 flex justify-between gap-2">
                    <span>
                      {i.mc_version} · {loaderLabel(i.loader)}
                    </span>
                    <span className="text-text-faint truncate">{timeAgo(i.last_played)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
        <div className="ml-auto min-w-0">
          <HomeCarousel />
        </div>
      </div>
    </div>
  );
}
