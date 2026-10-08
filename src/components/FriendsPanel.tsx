import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { isValidUsername } from "../lib/format";
import { useCloudStore, type Friend } from "../store/cloudStore";
import { useGameStore } from "../store/gameStore";
import { useInstanceStore } from "../store/instanceStore";
import { toast } from "../store/toastStore";
import { SkinCanvas } from "./AccountSkin";
import { Icon, Spinner } from "./ui";

function Head({ friend }: { friend: Friend }) {
  return (
    <div className="relative shrink-0">
      <div className="w-10 h-10 rounded-xl overflow-hidden bg-panel-3 flex items-center justify-center text-text-faint">
        {friend.skin ? (
          <SkinCanvas src={friend.skin} mode="head" className="w-full h-full" />
        ) : (
          <Icon name="user" className="w-5 h-5" />
        )}
      </div>
      {friend.state === "friend" && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-panel ${
            friend.online ? "bg-accent" : "bg-text-faint"
          }`}
        />
      )}
    </div>
  );
}

function statusLabel(friend: Friend) {
  if (!friend.online) return "Hors ligne";
  if (friend.status === "playing") return friend.server ? `En jeu sur ${friend.server}` : "En jeu";
  return "Dans le launcher";
}

/// Liste d'amis : qui est en ligne, demandes en attente, et rejoindre un ami en un clic.
export function FriendsPanel() {
  const { profile, ready, friends, refreshFriends, addFriend, acceptFriend, removeFriend } = useCloudStore();
  const { launch, joinOfficial, launchingId, runningId, preparingOfficial } = useGameStore();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [officialAddress, setOfficialAddress] = useState<string | null>(null);

  useEffect(() => {
    refreshFriends();
    const timer = setInterval(refreshFriends, 30_000);
    return () => clearInterval(timer);
  }, [refreshFriends, profile?.id]);

  useEffect(() => {
    api
      .listServers()
      .then((list) => setOfficialAddress(list.find((s) => s.official)?.address ?? null))
      .catch(() => {});
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center gap-2 text-text-muted">
        <Spinner /> Chargement...
      </div>
    );
  }

  if (!profile) {
    return (
      <section className="empty-state max-w-3xl">
        <Icon name="users" className="w-8 h-8 text-text-faint" />
        <div className="section-title text-text">Tu n'es pas connecté à un compte Nexora</div>
        <p className="text-sm max-w-md">
          Avoir un pseudo dans le launcher ne suffit pas : pour ajouter des amis et voir quand ils jouent, il faut
          être connecté à ton compte Nexora (e-mail et mot de passe) sur ce launcher.
        </p>
        <Link to="/account" className="btn btn-primary">
          <Icon name="user" className="w-4 h-4" /> Me connecter ou créer mon compte
        </Link>
      </section>
    );
  }

  async function handleAdd() {
    if (!isValidUsername(name) || busy) return;
    setBusy(true);
    const failure = await addFriend(name);
    setBusy(false);
    if (failure) toast.error(failure);
    else {
      toast.success(`Demande envoyée à ${name}`);
      setName("");
    }
  }

  async function handleAccept(friend: Friend) {
    const failure = await acceptFriend(friend.friendshipId);
    if (failure) toast.error(failure);
    else toast.success(`${friend.username} est maintenant ton ami`);
  }

  async function handleRemove(friend: Friend, message: string) {
    const failure = await removeFriend(friend.friendshipId);
    if (failure) toast.error(failure);
    else toast.info(message);
  }

  function handleJoin(friend: Friend) {
    if (!friend.server) return;
    if (friend.server === officialAddress) {
      joinOfficial(friend.server);
      return;
    }
    // Autre serveur : on y va avec la dernière instance jouée.
    const instances = [...useInstanceStore.getState().instances].sort(
      (a, b) => new Date(b.last_played ?? 0).getTime() - new Date(a.last_played ?? 0).getTime(),
    );
    if (!instances[0]) {
      toast.error("Crée d'abord une instance pour rejoindre ce serveur.");
      return;
    }
    launch(instances[0].id, friend.server);
  }

  const gameBusy = preparingOfficial || launchingId !== null || runningId !== null;
  const incoming = friends.filter((f) => f.state === "incoming");
  const outgoing = friends.filter((f) => f.state === "outgoing");
  const accepted = friends.filter((f) => f.state === "friend");
  const onlineCount = accepted.filter((f) => f.online).length;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <section className="card p-5 flex flex-col gap-3">
        <h2 className="section-title">Ajouter un ami</h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Icon name="search" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-faint" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Pseudo de ton ami"
              maxLength={16}
              className="input pl-10"
            />
          </div>
          <button onClick={handleAdd} disabled={busy || !isValidUsername(name)} className="btn btn-primary">
            {busy ? <Spinner /> : <Icon name="plus" className="w-4 h-4" />}
            Envoyer une demande
          </button>
        </div>
        <p className="text-[11px] text-text-faint">
          Ton ami doit avoir un compte Nexora. Ton pseudo : <span className="text-text">{profile.username}</span>
        </p>
      </section>

      {incoming.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">Demandes reçues</h2>
          <div className="flex flex-col gap-2 stagger">
            {incoming.map((friend) => (
              <div key={friend.friendshipId} className="row">
                <Head friend={friend} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{friend.username}</div>
                  <div className="text-[11px] text-text-faint">Veut t'ajouter en ami</div>
                </div>
                <button onClick={() => handleAccept(friend)} className="btn btn-primary btn-sm">
                  <Icon name="check" className="w-3.5 h-3.5" /> Accepter
                </button>
                <button onClick={() => handleRemove(friend, "Demande refusée")} className="btn btn-ghost btn-sm">
                  Refuser
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="section-title">Mes amis</h2>
          {accepted.length > 0 && (
            <span className="text-xs text-text-muted">
              {onlineCount} en ligne sur {accepted.length}
            </span>
          )}
        </div>
        {accepted.length === 0 ? (
          <div className="empty-state">
            <Icon name="users" className="w-8 h-8 text-text-faint" />
            <p className="text-sm">Aucun ami pour l'instant. Envoie une demande avec le pseudo d'un joueur.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 stagger">
            {accepted.map((friend) => (
              <div key={friend.friendshipId} className="row group">
                <Head friend={friend} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{friend.username}</div>
                  <div className={`text-[11px] truncate ${friend.online ? "text-accent" : "text-text-faint"}`}>
                    {statusLabel(friend)}
                  </div>
                </div>
                {friend.online && friend.server && (
                  <button
                    onClick={() => handleJoin(friend)}
                    disabled={gameBusy}
                    title={`Lance le jeu et rejoint ${friend.server}`}
                    className="btn btn-primary btn-sm btn-shine"
                  >
                    <Icon name="play" filled className="w-3 h-3" /> Rejoindre
                  </button>
                )}
                <button
                  onClick={() => handleRemove(friend, `${friend.username} retiré de tes amis`)}
                  className="btn btn-ghost btn-sm w-8 p-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:!text-danger"
                  title="Retirer de mes amis"
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {outgoing.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">Demandes envoyées</h2>
          <div className="flex flex-col gap-2">
            {outgoing.map((friend) => (
              <div key={friend.friendshipId} className="row">
                <Head friend={friend} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{friend.username}</div>
                  <div className="text-[11px] text-text-faint">En attente de réponse</div>
                </div>
                <button onClick={() => handleRemove(friend, "Demande annulée")} className="btn btn-ghost btn-sm">
                  Annuler
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
