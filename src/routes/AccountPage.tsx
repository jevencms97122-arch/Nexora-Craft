import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { AccountSkin, AccountSkin3D, SkinCanvas } from "../components/AccountSkin";
import { SkinBrowser } from "../components/SkinBrowser";
import { Icon, PageHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { isValidUsername } from "../lib/format";
import type { RemoteSkin, WardrobeSkin } from "../lib/types";
import { useAccountStore } from "../store/accountStore";
import { toast } from "../store/toastStore";

export function AccountPage() {
  const { accounts, activeUuid, loading, error, refresh, loginOffline, setActive, remove, loadLocalSkin, setRemoteSkin } =
    useAccountStore();
  const [wardrobe, setWardrobe] = useState<WardrobeSkin[]>([]);
  const [offlineName, setOfflineName] = useState("");
  const [variant, setVariant] = useState<"classic" | "slim">("classic");
  const [skinBusy, setSkinBusy] = useState(false);

  const activeAccount = accounts.find((a) => a.uuid === activeUuid) ?? null;

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function loadWardrobe() {
    const list = await api.listWardrobe().catch(() => []);
    setWardrobe(list);
    return list;
  }

  useEffect(() => {
    loadWardrobe();
  }, []);

  /// `applied` : vrai si l'action applique un skin (qui se retrouve alors en tête de garde-robe).
  async function runSkinAction(action: () => Promise<void>, success: string, applied = true) {
    if (!activeAccount) return;
    setSkinBusy(true);
    try {
      await action();
      const list = await loadWardrobe();
      if (activeAccount.is_offline) await loadLocalSkin(activeAccount.uuid);
      else if (applied && list[0]) setRemoteSkin(activeAccount.uuid, { url: list[0].data_uri, variant: list[0].variant });
      toast.success(success);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSkinBusy(false);
    }
  }

  async function handlePickSkin() {
    const path = await open({
      multiple: false,
      filters: [{ name: "Skin Minecraft", extensions: ["png"] }],
    });
    if (!path || Array.isArray(path)) return;
    await runSkinAction(() => api.setSkin(path, variant), "Skin mis à jour");
  }

  function handleApplyRemote(skin: RemoteSkin) {
    return runSkinAction(() => api.applyRemoteSkin(skin.url, skin.variant), "Skin appliqué");
  }

  function handleClearSkin() {
    return runSkinAction(() => api.clearSkin(), "Skin réinitialisé", false);
  }

  function handleApplyWardrobe(id: string) {
    return runSkinAction(() => api.applyWardrobeSkin(id), "Skin appliqué");
  }

  async function handleRemoveWardrobe(id: string) {
    await api.removeWardrobeSkin(id).catch(() => {});
    await loadWardrobe();
    toast.info("Skin retiré de la garde-robe");
  }

  async function handleOfflineLogin() {
    if (!isValidUsername(offlineName)) return;
    const name = offlineName.trim();
    await loginOffline(name);
    if (!useAccountStore.getState().error) {
      setOfflineName("");
      toast.success(`Compte ${name} créé`);
    }
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Profil" title="Compte" subtitle="Gère tes comptes Minecraft et ton apparence en jeu." />

      {error && <div className="alert-error">{error}</div>}

      {/* Deux colonnes : l'apparence à gauche (profil, garde-robe, skins en ligne), les comptes à droite. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="flex flex-col gap-6 min-w-0">
          {activeAccount ? (
            <section className="card overflow-hidden">
              <div className="grid grid-cols-[220px_minmax(0,1fr)]">
                <div className="relative flex items-end justify-center pt-8 pb-6 bg-gradient-to-b from-accent/10 via-transparent to-transparent border-r border-border">
                  <div className="absolute inset-0 grid-pattern opacity-70" />
                  <div className="absolute bottom-5 w-36 h-8 rounded-[50%] bg-accent/25 blur-xl" />
                  <div className="relative drop-shadow-[0_16px_24px_rgba(0,0,0,0.6)]">
                    <AccountSkin3D account={activeAccount} height={256} />
                  </div>
                </div>

                <div className="p-6 flex flex-col gap-5 min-w-0 justify-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold truncate" style={{ fontFamily: "var(--font-display)" }}>
                        {activeAccount.username}
                      </h2>
                      <span className="badge badge-accent">Actif</span>
                    </div>
                    <p className="text-xs text-text-muted mt-2 leading-relaxed max-w-md">
                      {activeAccount.is_offline
                        ? "Le skin est appliqué via un resource pack au lancement : il est visible par toi. Le modèle des bras dépend du compte."
                        : "Le skin est envoyé sur ton compte Mojang et visible par tous les joueurs. Il peut mettre quelques minutes à apparaître."}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!activeAccount.is_offline && (
                      <div className="flex rounded-xl bg-panel-2 border border-border-strong p-1">
                        {(["classic", "slim"] as const).map((v) => (
                          <button
                            key={v}
                            onClick={() => setVariant(v)}
                            className={`px-3 h-7 rounded-lg text-xs font-semibold transition-colors ${
                              variant === v ? "bg-accent text-accent-ink" : "text-text-muted hover:text-text"
                            }`}
                          >
                            {v === "classic" ? "Bras larges" : "Bras fins"}
                          </button>
                        ))}
                      </div>
                    )}
                    <button onClick={handlePickSkin} disabled={skinBusy} className="btn btn-primary">
                      {skinBusy ? <Spinner /> : <Icon name="upload" className="w-4 h-4" />}
                      Importer un .png
                    </button>
                    <button onClick={handleClearSkin} disabled={skinBusy} className="btn btn-ghost">
                      <Icon name="refresh" className="w-4 h-4" /> Réinitialiser
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <section className="empty-state">
              <Icon name="user" className="w-8 h-8 text-text-faint" />
              <div className="section-title text-text">Aucun compte</div>
              <p className="text-sm">Crée un compte avec ton pseudo pour commencer.</p>
            </section>
          )}

          {activeAccount && wardrobe.length > 0 && (
            <section className="card p-5 flex flex-col gap-4">
              <div>
                <div className="eyebrow mb-1.5">Garde-robe</div>
                <h2 className="section-title text-lg">Mes skins</h2>
                <p className="text-xs text-text-muted mt-1">
                  Chaque skin que tu appliques est gardé ici. Clique pour le remettre.
                </p>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3 stagger">
                {wardrobe.map((skin) => (
                  <div key={skin.id} className="group relative">
                    <button
                      onClick={() => handleApplyWardrobe(skin.id)}
                      disabled={skinBusy}
                      title="Appliquer ce skin"
                      className="w-full row flex-col !gap-2 !py-3 disabled:opacity-50"
                    >
                      <SkinCanvas
                        src={skin.data_uri}
                        mode="body"
                        className="h-24 transition-transform group-hover:-translate-y-1"
                      />
                      <span className="text-[11px] font-semibold text-text-faint group-hover:text-accent transition-colors">
                        {skin.variant === "slim" ? "Bras fins" : "Bras larges"}
                      </span>
                    </button>
                    <button
                      onClick={() => handleRemoveWardrobe(skin.id)}
                      title="Retirer de la garde-robe"
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg flex items-center justify-center text-text-faint hover:text-danger hover:bg-fg/8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    >
                      <Icon name="trash" className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeAccount && (
            <section className="card p-5">
              <SkinBrowser variant={variant} onApply={handleApplyRemote} busy={skinBusy} />
            </section>
          )}
        </div>

        {/* Comptes */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-2">
          <section className="card p-5 flex flex-col gap-3">
            <h2 className="section-title">Mes comptes</h2>
            {accounts.length === 0 && <p className="text-xs text-text-muted">Aucun compte pour l'instant.</p>}
            {accounts.map((account) => {
              const isActive = account.uuid === activeUuid;
              return (
                <div
                  key={account.uuid}
                  className={`row group ${isActive ? "!border-accent/50 !bg-accent/5" : "cursor-pointer"}`}
                  onClick={() => !isActive && setActive(account.uuid)}
                >
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-panel-3 shrink-0">
                    <AccountSkin account={account} mode="head" className="w-full h-full" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{account.username}</div>
                    <div className={`text-[11px] ${isActive ? "text-accent" : "text-text-faint"}`}>
                      {isActive ? "● Actif" : "Cliquer pour activer"}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(account.uuid);
                      toast.info(`Compte ${account.username} retiré`);
                    }}
                    className="btn btn-ghost btn-sm w-8 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:!text-danger"
                    title="Retirer ce compte"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </section>

          <section className="card p-5 flex flex-col gap-3">
            <h2 className="section-title">Ajouter un compte</h2>
            <div>
              <label className="label">Pseudo</label>
              <div className="flex gap-2">
                <input
                  value={offlineName}
                  onChange={(e) => setOfflineName(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleOfflineLogin()}
                  placeholder="Ton pseudo en jeu"
                  maxLength={16}
                  className="input"
                />
                <button
                  onClick={handleOfflineLogin}
                  disabled={loading || !isValidUsername(offlineName)}
                  className="btn btn-primary"
                >
                  Créer
                </button>
              </div>
              <p className="text-[11px] text-text-faint mt-2 leading-relaxed">
                3 à 16 caractères : lettres, chiffres et « _ ».
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
