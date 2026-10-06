import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "../lib/api";
import type { Settings } from "../lib/types";

interface TogetherLog {
  line: string;
}

export function TogetherPage() {
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
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!settings) {
    return <div className="p-6 text-text-muted text-sm">Chargement...</div>;
  }

  return (
    <div className="p-6 max-w-2xl flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Jouer ensemble</h1>
        <p className="text-sm text-text-muted mt-1">
          Ouvre ton monde à tes amis sur internet, sans compte Microsoft — via un tunnel{" "}
          <span className="text-text">playit.gg</span> (gratuit).
        </p>
      </div>

      <section className="bg-panel-2 border border-border rounded-2xl p-4 flex flex-col gap-4">
        <h2 className="text-sm font-medium">1. Port du monde</h2>
        <p className="text-sm text-text-muted">
          Le port sur lequel ton monde Minecraft écoute en local. Laisse{" "}
          <span className="text-text font-mono">25565</span> si tu ne sais pas — c'est le port par
          défaut.
        </p>
        <div className="flex gap-2">
          <input
            value={port}
            onChange={(e) => setPort(Number(e.target.value) || 25565)}
            type="number"
            className="w-40 bg-panel border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent font-mono"
          />
          <button
            onClick={handleSavePort}
            disabled={savingPort}
            className="px-4 py-2 rounded-xl text-sm border border-border hover:border-accent/60 disabled:opacity-50 shrink-0"
          >
            {savingPort ? "..." : "Enregistrer"}
          </button>
        </div>
      </section>

      <section className="bg-panel-2 border border-border rounded-2xl p-4 flex flex-col gap-4">
        <h2 className="text-sm font-medium">2. Clé secrète playit.gg</h2>
        <ol className="text-sm text-text-muted list-decimal list-inside flex flex-col gap-1.5">
          <li>
            Crée un agent{" "}
            <button
              onClick={() =>
                openUrl("https://playit.gg/account/setup/wizard/new-account/docker/docker-name")
              }
              className="text-accent underline"
            >
              sur playit.gg
            </button>{" "}
            (ignore la partie "Docker", on n'en a pas besoin).
          </li>
          <li>Copie la clé secrète affichée et colle-la ci-dessous, puis enregistre.</li>
        </ol>

        <div>
          <label className="block text-xs text-text-muted mb-1">Clé secrète</label>
          <div className="flex gap-2">
            <input
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              type="password"
              className="flex-1 bg-panel border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent font-mono"
            />
            <button
              onClick={handleSaveKey}
              disabled={savingKey || !secretKey.trim()}
              className="px-4 py-2 rounded-full bg-accent hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 text-sm font-medium shrink-0"
            >
              {savingKey ? "..." : "Enregistrer"}
            </button>
          </div>
        </div>
      </section>

      {hasKey && (
        <section className="bg-panel-2 border border-border rounded-2xl p-4 flex flex-col gap-4">
          <h2 className="text-sm font-medium">3. Démarrer l'agent</h2>
          <div className="flex items-center gap-3">
            {running ? (
              <button
                onClick={handleStop}
                className="px-4 py-2 rounded-full bg-red-500/90 hover:bg-red-500 active:scale-[0.98] transition-all text-sm font-medium"
              >
                Arrêter le tunnel
              </button>
            ) : (
              <button
                onClick={handleStart}
                disabled={starting}
                className="px-4 py-2 rounded-full bg-accent hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 text-sm font-medium"
              >
                {starting ? "Démarrage..." : "Démarrer le tunnel"}
              </button>
            )}
            {running && <span className="text-xs text-green-400">● Agent en cours d'exécution</span>}
          </div>
          <p className="text-xs text-text-muted">
            Une fois démarré, va sur{" "}
            <button onClick={() => openUrl("https://playit.gg/account")} className="text-accent underline">
              playit.gg/account
            </button>{" "}
            → ton agent devrait apparaître "en ligne" → onglet Tunnels → Add Tunnel → type "Minecraft
            Java" → adresse locale{" "}
            <code className="bg-panel px-1 rounded">localhost:{port}</code>. Colle l'adresse
            publique assignée ci-dessous.
          </p>

          {logs.length > 0 && (
            <div className="w-full h-40 bg-black/40 border border-border rounded-2xl p-3 overflow-y-auto font-mono text-xs">
              {logs.map((line, idx) => (
                <div key={idx} className="text-text-muted">
                  {line}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </section>
      )}

      {hasKey && (
        <section className="bg-panel-2 border border-border rounded-2xl p-4 flex flex-col gap-3">
          <h2 className="text-sm font-medium">4. Adresse à partager avec tes amis</h2>
          <div className="flex gap-2">
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="ex: casual-fox.playit.gg"
              className="flex-1 bg-panel border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent font-mono"
            />
            <button
              onClick={handleSaveAddress}
              disabled={savingAddress || !address.trim()}
              className="px-4 py-2 rounded-xl text-sm border border-border hover:border-accent/60 disabled:opacity-50 shrink-0"
            >
              {savingAddress ? "..." : "Enregistrer"}
            </button>
          </div>

          {settings.together_address && (
            <div className="flex items-center justify-between bg-panel rounded-xl px-3 py-2">
              <span className="font-mono text-accent">{settings.together_address}</span>
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-xl text-xs border border-border hover:border-accent/60"
              >
                {copied ? "Copié ✓" : "Copier"}
              </button>
            </div>
          )}

          <div className="text-xs text-text-muted bg-panel rounded-xl px-3 py-2">
            Dans Minecraft : Échap → "Ouvrir sur le réseau local" → mets le port sur{" "}
            <span className="text-text font-mono">{port}</span> avant de valider, pour que vos amis
            rejoignent votre monde depuis{" "}
            {settings.together_address ? (
              <span className="text-accent font-mono">{settings.together_address}</span>
            ) : (
              <span className="italic">l'adresse ci-dessus</span>
            )}
            .
          </div>
        </section>
      )}

      {error && <div className="text-sm text-red-400">{error}</div>}
    </div>
  );
}
