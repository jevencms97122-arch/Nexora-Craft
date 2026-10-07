import { useEffect, useRef, useState, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Icon, Spinner } from "../components/ui";
import { api } from "../lib/api";
import type { Settings } from "../lib/types";
import { toast } from "../store/toastStore";

function Step({ n, title, done, children }: {
  n: number;
  title: string;
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="relative pl-14">
      <div
        className={`absolute left-0 top-0 w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold ${
          done
            ? "bg-accent text-accent-ink shadow-[0_0_18px_-4px_var(--color-accent)]"
            : "bg-panel-3 text-text-muted border border-border-strong"
        }`}
      >
        {done ? <Icon name="check" className="w-4 h-4" /> : n}
      </div>
      <div className="card p-5 flex flex-col gap-4">
        <h2 className="section-title">{title}</h2>
        {children}
      </div>
    </section>
  );
}

interface TogetherLog {
  line: string;
}

/// Hébergement d'un monde via un tunnel playit.gg (onglet « Héberger » de la page Multi).
export function HostPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [secretKey, setSecretKey] = useState("");
  const [port, setPort] = useState(25565);
  const [address, setAddress] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [savingPort, setSavingPort] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      setSecretKey(s.together_secret_key ?? "");
      setPort(s.together_port ?? 25565);
      setAddress(s.together_address ?? "");
    });
    api.isTogetherRunning().then(setRunning);

    const unlisten = listen<TogetherLog>("together-log", (event) => {
      setLogs((prev) => [...prev, event.payload.line].slice(-300));
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const hasKey = !!settings?.together_secret_key;

  async function handleSaveKey() {
    if (!settings || !secretKey.trim()) return;
    setSavingKey(true);
    setError(null);
    try {
      const updated: Settings = { ...settings, together_secret_key: secretKey.trim() };
      await api.saveSettings(updated);
      setSettings(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingKey(false);
    }
  }

  async function handleSavePort() {
    setSavingPort(true);
    setError(null);
    try {
      await api.saveTogetherPort(port);
      if (settings) setSettings({ ...settings, together_port: port });
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingPort(false);
    }
  }

  async function handleSaveAddress() {
    if (!settings || !address.trim()) return;
    setSavingAddress(true);
    setError(null);
    try {
      const updated: Settings = { ...settings, together_address: address.trim() };
      await api.saveSettings(updated);
      setSettings(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingAddress(false);
    }
  }

  async function handleStart() {
    setStarting(true);
    setError(null);
    setLogs([]);
    try {
      await api.startTogether();
      setRunning(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  }

  async function handleStop() {
    await api.stopTogether();
    setRunning(false);
  }

  async function handleCopy() {
    if (!settings?.together_address) return;
    await navigator.clipboard.writeText(settings.together_address);
    toast.success("Adresse copiée");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!settings) {
    return (
      <div className="flex items-center gap-2 text-text-muted">
        <Spinner /> Chargement...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-text-muted leading-relaxed max-w-xl">
          Ouvre ton monde à tes amis sur internet, sans redirection de port, grâce à un tunnel{" "}
          <span className="text-text font-medium">playit.gg</span> gratuit.
        </p>
        {running && (
          <span className="badge badge-accent h-7 px-3 text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse mr-2" /> Tunnel actif
          </span>
        )}
      </div>

      <div className="relative flex flex-col gap-5 stagger before:absolute before:left-[17px] before:top-9 before:bottom-9 before:w-px before:bg-border-strong">
        <Step n={1} title="Port du monde" done={!!settings.together_port}>
          <p className="text-sm text-text-muted leading-relaxed">
            Le port sur lequel ton monde Minecraft écoute en local. Laisse <span className="kbd">25565</span> si tu
            ne sais pas, c'est la valeur par défaut.
          </p>
          <div className="flex gap-2">
            <input
              value={port}
              onChange={(e) => setPort(Number(e.target.value) || 25565)}
              type="number"
              className="input w-40 font-mono"
            />
            <button onClick={handleSavePort} disabled={savingPort} className="btn btn-secondary">
              {savingPort ? <Spinner /> : "Enregistrer"}
            </button>
          </div>
        </Step>

        <Step n={2} title="Clé secrète playit.gg" done={hasKey}>
          <ol className="text-sm text-text-muted flex flex-col gap-2 leading-relaxed">
            <li>
              <span className="text-text font-medium">a.</span> Crée un agent{" "}
              <button
                onClick={() => openUrl("https://playit.gg/account/setup/wizard/new-account/docker/docker-name")}
                className="text-accent hover:underline inline-flex items-center gap-1"
              >
                sur playit.gg <Icon name="external" className="w-3 h-3" />
              </button>{" "}
              (ignore la partie « Docker »).
            </li>
            <li>
              <span className="text-text font-medium">b.</span> Copie la clé secrète affichée, colle-la ci-dessous et
              enregistre.
            </li>
          </ol>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Icon name="key" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" />
              <input
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                type="password"
                placeholder="Clé secrète"
                className="input pl-10 font-mono"
              />
            </div>
            <button onClick={handleSaveKey} disabled={savingKey || !secretKey.trim()} className="btn btn-primary">
              {savingKey ? <Spinner /> : "Enregistrer"}
            </button>
          </div>
        </Step>

        {hasKey && (
          <Step n={3} title="Démarrer le tunnel" done={running}>
            <div className="flex items-center gap-3">
              {running ? (
                <button onClick={handleStop} className="btn btn-danger-solid">
                  Arrêter le tunnel
                </button>
              ) : (
                <button onClick={handleStart} disabled={starting} className="btn btn-primary">
                  {starting ? <Spinner /> : <Icon name="play" filled className="w-4 h-4" />}
                  {starting ? "Démarrage" : "Démarrer le tunnel"}
                </button>
              )}
              {running && (
                <span className="text-xs text-accent flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> Agent en cours d'exécution
                </span>
              )}
            </div>
            <p className="text-xs text-text-muted leading-relaxed">
              Une fois démarré, va sur{" "}
              <button onClick={() => openUrl("https://playit.gg/account")} className="text-accent hover:underline">
                playit.gg/account
              </button>{" "}
              : ton agent doit apparaître « en ligne ». Onglet <span className="text-text">Tunnels</span> →{" "}
              <span className="text-text">Add Tunnel</span> → type <span className="text-text">Minecraft Java</span> →
              adresse locale <span className="kbd">localhost:{port}</span>. Colle ensuite l'adresse publique à l'étape 4.
            </p>

            {logs.length > 0 && (
              <div className="terminal h-44">
                {logs.map((line, idx) => (
                  <div key={idx} className="text-text-muted">
                    {line}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </Step>
        )}

        {hasKey && (
          <Step n={4} title="Adresse à partager" done={!!settings.together_address}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Icon name="globe" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" />
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="ex: casual-fox.playit.gg"
                  className="input pl-10 font-mono"
                />
              </div>
              <button onClick={handleSaveAddress} disabled={savingAddress || !address.trim()} className="btn btn-secondary">
                {savingAddress ? <Spinner /> : "Enregistrer"}
              </button>
            </div>

            {settings.together_address && (
              <div className="flex items-center justify-between gap-3 rounded-2xl px-5 py-4 bg-accent/8 border border-accent/30 shadow-[0_0_40px_-16px_var(--color-accent)]">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.12em] text-text-muted mb-1">Adresse du serveur</div>
                  <div className="font-mono text-lg text-accent truncate select-text">{settings.together_address}</div>
                </div>
                <button onClick={handleCopy} className="btn btn-primary btn-sm shrink-0">
                  <Icon name={copied ? "check" : "copy"} className="w-3.5 h-3.5" />
                  {copied ? "Copié" : "Copier"}
                </button>
              </div>
            )}

            <div className="text-xs text-text-muted bg-panel-2 rounded-xl px-4 py-3 leading-relaxed">
              Dans Minecraft : <span className="text-text">Échap → Ouvrir sur le réseau local</span>, mets le port sur{" "}
              <span className="kbd">{port}</span> avant de valider. Tes amis rejoignent ensuite depuis{" "}
              {settings.together_address ? (
                <span className="text-accent font-mono">{settings.together_address}</span>
              ) : (
                <span className="italic">l'adresse ci-dessus</span>
              )}
              .
            </div>
          </Step>
        )}
      </div>

      {error && <div className="alert-error">{error}</div>}
    </div>
  );
}
