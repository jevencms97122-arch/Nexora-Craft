import { useState } from "react";
import { isValidUsername } from "../lib/format";
import { useAccountStore } from "../store/accountStore";
import { useCloudStore } from "../store/cloudStore";
import { toast } from "../store/toastStore";
import { Icon, Spinner } from "./ui";

type Mode = "signin" | "signup";

/// Compte Nexora : réserve le pseudo et débloque les amis et le skin en ligne.
export function CloudAccount() {
  const { profile, session, ready, signIn, signUp, signOut, pendingEmail, resendConfirmation, cancelPending } =
    useCloudStore();
  const activeName = useAccountStore((s) => s.active()?.username ?? "");
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Par défaut, on propose de réserver le pseudo du compte actif.
  const name = username ?? activeName;
  const canSubmit =
    email.includes("@") && password.length >= 6 && (mode === "signin" || isValidUsername(name)) && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    if (mode === "signin") {
      const failure = await signIn(email, password);
      if (failure) setError(failure);
      else toast.success("Connecté à ton compte Nexora");
    } else {
      const result = await signUp(email, password, name);
      if (result.error) setError(result.error);
      else if (result.confirm) setPassword("");
      else toast.success(`Pseudo ${name} réservé`);
    }
    setBusy(false);
  }

  if (!ready) {
    return (
      <section className="card p-5 flex items-center gap-2 text-text-muted text-sm">
        <Spinner /> Compte Nexora...
      </section>
    );
  }

  if (session && profile) {
    return (
      <section className="card p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-title">Compte Nexora</h2>
          <span className="badge badge-accent">Connecté</span>
        </div>
        <div className="row">
          <div className="icon-tile w-10 h-10 flex items-center justify-center text-accent shrink-0">
            <Icon name="check" className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{profile.username}</div>
            <div className="text-[11px] text-text-faint truncate">{session.user.email}</div>
          </div>
        </div>
        <p className="text-[11px] text-text-faint leading-relaxed">
          Ce pseudo t'est réservé. Ton skin est publié en ligne et tes amis voient quand tu joues.
        </p>
        <button
          onClick={async () => {
            await signOut();
            toast.info("Déconnecté du compte Nexora");
          }}
          className="btn btn-ghost btn-sm self-start"
        >
          Se déconnecter
        </button>
      </section>
    );
  }

  // Inscription faite, e-mail pas encore confirmé : on attend le clic sur le lien, sans formulaire.
  if (pendingEmail) {
    return (
      <section className="card p-5 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-title">Compte Nexora</h2>
          <span className="badge">En attente</span>
        </div>
        <div className="row !cursor-default">
          <div className="icon-tile w-10 h-10 flex items-center justify-center text-accent shrink-0">
            <Spinner className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Confirmation en cours</div>
            <div className="text-[11px] text-text-faint truncate">{pendingEmail}</div>
          </div>
        </div>
        <p className="text-xs text-text-muted leading-relaxed">
          Ouvre l'e-mail qu'on vient de t'envoyer et clique sur le bouton. Garde le launcher ouvert : ton compte
          sera créé et connecté tout seul.
        </p>
        {error && <div className="alert-error">{error}</div>}
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setBusy(true);
              setError(null);
              const failure = await resendConfirmation();
              setBusy(false);
              if (failure) setError(failure);
              else toast.success("E-mail renvoyé");
            }}
            disabled={busy}
            className="btn btn-secondary btn-sm"
          >
            {busy ? <Spinner /> : <Icon name="refresh" className="w-3.5 h-3.5" />}
            Renvoyer l'e-mail
          </button>
          <button
            onClick={() => {
              setError(null);
              cancelPending();
            }}
            className="btn btn-ghost btn-sm"
          >
            Annuler
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card p-5 flex flex-col gap-3">
      <div>
        <h2 className="section-title">Compte Nexora</h2>
        <p className="text-[11px] text-text-faint leading-relaxed mt-1.5">
          Réserve ton pseudo, ajoute tes amis et publie ton skin en ligne. Facultatif : tu peux jouer sans.
        </p>
      </div>

      <div className="flex rounded-xl bg-panel-2 border border-border-strong p-1">
        {(["signup", "signin"] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 h-7 rounded-lg text-xs font-semibold transition-colors ${
              mode === m ? "bg-accent text-accent-ink" : "text-text-muted hover:text-text"
            }`}
          >
            {m === "signup" ? "Créer un compte" : "Se connecter"}
          </button>
        ))}
      </div>

      {mode === "signup" && (
        <div>
          <label className="label">Pseudo à réserver</label>
          <input
            value={name}
            onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
            placeholder="Ton pseudo en jeu"
            maxLength={16}
            className="input"
          />
        </div>
      )}
      <div>
        <label className="label">E-mail</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="toi@exemple.com"
          autoComplete="email"
          className="input"
        />
      </div>
      <div>
        <label className="label">Mot de passe</label>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          type="password"
          placeholder="6 caractères minimum"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className="input"
        />
      </div>

      {error && <div className="alert-error">{error}</div>}

      <button onClick={submit} disabled={!canSubmit} className="btn btn-primary">
        {busy ? <Spinner /> : null}
        {mode === "signup" ? "Créer mon compte" : "Se connecter"}
      </button>
    </section>
  );
}
