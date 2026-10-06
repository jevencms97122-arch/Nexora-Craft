import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../lib/api";
import { useAccountStore } from "../store/accountStore";

export function AccountPage() {
  const { accounts, activeUuid, loading, error, refresh, login, loginOffline, setActive, remove } =
    useAccountStore();
  const [offlineName, setOfflineName] = useState("");
  const [variant, setVariant] = useState<"classic" | "slim">("classic");
  const [skinBusy, setSkinBusy] = useState(false);
  const [skinMessage, setSkinMessage] = useState<string | null>(null);
  const [localSkin, setLocalSkin] = useState<string | null>(null);

  const activeAccount = accounts.find((a) => a.uuid === activeUuid) ?? null;

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setSkinMessage(null);
    if (activeAccount?.is_offline) {
      api.getLocalSkin(activeAccount.uuid).then(setLocalSkin).catch(() => setLocalSkin(null));
    } else {
      setLocalSkin(null);
    }
  }, [activeAccount?.uuid, activeAccount?.is_offline]);

  async function handlePickSkin() {
    if (!activeAccount) return;
    const path = await open({
      multiple: false,
      filters: [{ name: "Skin Minecraft", extensions: ["png"] }],
    });
    if (!path || Array.isArray(path)) return;
    setSkinBusy(true);
    setSkinMessage(null);
    try {
      await api.setSkin(path, variant);
      if (activeAccount.is_offline) setLocalSkin(await api.getLocalSkin(activeAccount.uuid));
      setSkinMessage("Skin mis à jour.");
    } catch (e) {
      setSkinMessage(String(e));
    } finally {
      setSkinBusy(false);
    }
  }

  async function handleClearSkin() {
    if (!activeAccount) return;
    setSkinBusy(true);
    setSkinMessage(null);
    try {
      await api.clearSkin();
      setLocalSkin(null);
      setSkinMessage("Skin réinitialisé.");
    } catch (e) {
      setSkinMessage(String(e));
    } finally {
      setSkinBusy(false);
    }
  }

  async function handleOfflineLogin() {
    if (!offlineName.trim()) return;
    await loginOffline(offlineName.trim());
    setOfflineName("");
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-xl font-semibold mb-6">Compte</h1>

      <button
        onClick={login}
        disabled={loading}
        className="px-4 py-2 rounded-full bg-accent hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 text-sm font-medium mb-2"
      >
        {loading ? "Connexion en cours (navigateur)..." : "Se connecter avec Microsoft"}
      </button>
      <p className="text-xs text-text-muted mb-6">
        Nécessite un Client ID Microsoft configuré dans{" "}
        <Link to="/settings" className="text-accent underline">
          Paramètres
        </Link>
        .
      </p>

      {error && <div className="text-sm text-red-400 mb-4 whitespace-pre-wrap">{error}</div>}

      <div className="bg-panel-2 border border-border rounded-2xl p-4 mb-6">
        <h2 className="text-sm font-medium mb-1">Compte local (test)</h2>
        <p className="text-xs text-text-muted mb-3">
          Pas de vraie session Mojang, uniquement pour tester instances/mods/lancement en local
          (solo). Ne fonctionnera pas sur des serveurs multijoueur en ligne.
        </p>
        <div className="flex gap-2">
          <input
            value={offlineName}
            onChange={(e) => setOfflineName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleOfflineLogin()}
            placeholder="Pseudo"
            className="flex-1 bg-panel border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={handleOfflineLogin}
            disabled={loading || !offlineName.trim()}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-border hover:border-accent/60 disabled:opacity-50"
          >
            Créer
          </button>
        </div>
      </div>

      {activeAccount && (
        <div className="bg-panel-2 border border-border rounded-2xl p-4 mb-6">
          <h2 className="text-sm font-medium mb-1">Skin de {activeAccount.username}</h2>
          <p className="text-xs text-text-muted mb-3">
            {activeAccount.is_offline
              ? "Compte local : le skin est appliqué via un resource pack au lancement (visible uniquement par toi, en solo). Le modèle des bras (classique/fin) dépend du compte."
              : "Le skin est envoyé sur ton compte Mojang et visible par tous les joueurs. Il peut mettre quelques minutes à apparaître."}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {activeAccount.is_offline && localSkin && (
              <img
                src={localSkin}
                alt="Skin actuel"
                className="w-16 h-16 rounded-xl border border-border"
                style={{ imageRendering: "pixelated" }}
              />
            )}
            {!activeAccount.is_offline && (
              <select
                value={variant}
                onChange={(e) => setVariant(e.target.value as "classic" | "slim")}
                className="bg-panel border border-border rounded-xl px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="classic">Classique (bras larges)</option>
                <option value="slim">Fin (bras fins)</option>
              </select>
            )}
            <button
              onClick={handlePickSkin}
              disabled={skinBusy}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-border hover:border-accent/60 disabled:opacity-50"
            >
              {skinBusy ? "Envoi..." : "Choisir un skin (.png)"}
            </button>
            <button
              onClick={handleClearSkin}
              disabled={skinBusy}
              className="px-3 py-2 rounded-xl text-sm text-text-muted hover:text-red-400 disabled:opacity-50"
            >
              Réinitialiser
            </button>
          </div>
          {skinMessage && <div className="text-xs mt-3 whitespace-pre-wrap">{skinMessage}</div>}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {accounts.map((account) => (
          <div
            key={account.uuid}
            className={`flex items-center gap-3 p-3 rounded-2xl border ${
              account.uuid === activeUuid ? "border-accent bg-panel-2" : "border-border bg-panel"
            }`}
          >
            <img
              src={`https://mc-heads.net/avatar/${account.uuid}/40`}
              alt=""
              className="w-10 h-10 rounded-xl"
            />
            <div className="flex-1">
              <div className="font-medium">
                {account.username}
                {account.is_offline && (
                  <span className="ml-2 text-xs text-text-muted border border-border rounded px-1.5 py-0.5">
                    local
                  </span>
                )}
              </div>
              {account.uuid === activeUuid && (
                <div className="text-xs text-accent">Compte actif</div>
              )}
            </div>
            {account.uuid !== activeUuid && (
              <button
                onClick={() => setActive(account.uuid)}
                className="text-xs text-text-muted hover:text-text"
              >
                Activer
              </button>
            )}
            <button
              onClick={() => remove(account.uuid)}
              className="text-xs text-text-muted hover:text-red-400"
            >
              Retirer
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
