import { useEffect, useState } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { CommandPalette } from "./components/CommandPalette";
import { CrashModal } from "./components/CrashModal";
import { ImportModal } from "./components/ImportModal";
import { MinecraftScene } from "./components/MinecraftScene";
import { Onboarding, needsOnboarding } from "./components/Onboarding";
import { Sidebar } from "./components/Sidebar";
import { Toasts } from "./components/Toasts";
import { UpdatePrompt } from "./components/UpdatePrompt";
import { TitleBar } from "./components/TitleBar";
import { PlayPage } from "./routes/PlayPage";
import { InstancesPage } from "./routes/InstancesPage";
import { AccountPage } from "./routes/AccountPage";
import { SettingsPage } from "./routes/SettingsPage";
import { ContentPage } from "./routes/ContentPage";
import { InstanceDetailPage } from "./routes/InstanceDetailPage";
import { GalleryPage } from "./routes/GalleryPage";
import { MultiPage } from "./routes/MultiPage";
import { useAccountStore } from "./store/accountStore";
import { useBackgroundStore } from "./store/backgroundStore";
import { useCloudStore } from "./store/cloudStore";
import { trackLaunch } from "./lib/telemetry";
import { useGameStore } from "./store/gameStore";
import { useMusicStore } from "./store/musicStore";
import { useThemeStore } from "./store/themeStore";

function AppShell() {
  const location = useLocation();
  const { image, refresh } = useBackgroundStore();
  const { theme, animated, sceneMode, weather } = useThemeStore();
  const runningId = useGameStore((s) => s.runningId);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    trackLaunch();
  }, []);

  // Les musiques viennent des fichiers du jeu : on relit la liste au démarrage, puis à chaque
  // début et fin de partie (un premier lancement vient de les télécharger).
  useEffect(() => {
    useMusicStore.getState().loadTracks();
  }, [runningId]);

  // Musique d'ambiance : seulement quand la fenêtre du launcher est au premier plan. Elle se coupe
  // donc quand on passe sur le jeu, et revient si on retourne sur le launcher pendant la partie.
  useEffect(() => {
    const update = () => useMusicStore.getState().setAllowed(document.hasFocus());
    update();
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, []);

  // Présence : tant qu'un compte Nexora est connecté, on signale régulièrement aux amis si le
  // joueur est dans le launcher ou en jeu, et on en profite pour relire leur état.
  const cloudUser = useCloudStore((s) => s.profile?.id ?? null);
  const currentServer = useGameStore((s) => s.currentServer);
  useEffect(() => {
    if (!cloudUser) return;
    const beat = () => {
      const { heartbeat, refreshFriends } = useCloudStore.getState();
      heartbeat(runningId ? "playing" : "launcher", runningId ? currentServer : null).then(refreshFriends);
    };
    beat();
    const timer = setInterval(beat, 60_000);
    return () => clearInterval(timer);
  }, [cloudUser, runningId, currentServer]);

  // Transition de page : l'ancienne page joue sa sortie, puis la nouvelle est montée et entre.
  const [displayed, setDisplayed] = useState(location);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (location.pathname === displayed.pathname) {
      setDisplayed(location);
      return;
    }
    setLeaving(true);
    const timer = setTimeout(() => {
      setDisplayed(location);
      setLeaving(false);
    }, 140);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  const isPlay = displayed.pathname === "/";

  // Premier lancement : aucun compte et parcours jamais fait. Décidé une seule fois, au chargement
  // des comptes, pour que le parcours ne se ferme pas tout seul dès que le compte est créé.
  const accountsLoaded = useAccountStore((s) => s.loaded);
  const [onboarding, setOnboarding] = useState(false);
  useEffect(() => {
    if (accountsLoaded && useAccountStore.getState().accounts.length === 0 && needsOnboarding()) {
      setOnboarding(true);
    }
  }, [accountsLoaded]);

  return (
    <div className="h-screen w-screen flex relative overflow-hidden bg-bg">
      {/* Fond : image perso si définie, sinon scène Minecraft (nuit en sombre, jour en clair). */}
      <div className="fixed inset-0">
        {image ? (
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${image})` }} />
        ) : (
          // L'animation est mise en pause pendant une partie pour laisser le GPU au jeu.
          <MinecraftScene
            theme={theme}
            animated={animated}
            paused={!!runningId}
            mode={sceneMode}
            weatherEnabled={weather}
            className="absolute inset-0 w-full h-full"
          />
        )}
      </div>

      {/* Voile de lisibilité : léger sur Jouer, plus marqué (et flouté) ailleurs, avec un fondu entre les deux. */}
      <div
        className={`fixed inset-0 pointer-events-none transition-opacity duration-500 ${isPlay ? "opacity-100" : "opacity-0"}`}
      >
        {/* Le voile ne couvre que la zone du texte (à gauche) et le bas : la scène reste nette à droite. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--color-bg) 88%, transparent) 0%, color-mix(in srgb, var(--color-bg) 55%, transparent) 32%, transparent 58%)",
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-bg/75 to-transparent" />
      </div>
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: isPlay ? "transparent" : "var(--scrim)",
          backdropFilter: isPlay ? "blur(0px)" : "blur(40px)",
          transition: "background 0.5s, backdrop-filter 0.5s",
        }}
      />

      <Sidebar />
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        <TitleBar />
        <main
          key={displayed.pathname}
          className={`flex-1 overflow-y-auto overflow-x-hidden min-h-0 ${leaving ? "page-out" : "page-in"}`}
        >
          <Routes location={displayed}>
            <Route path="/" element={<PlayPage />} />
            <Route path="/instances" element={<InstancesPage />} />
            <Route path="/instances/:instanceId" element={<InstanceDetailPage />} />
            <Route path="/content" element={<ContentPage />} />
            <Route path="/together" element={<MultiPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
      <CrashModal />
      <ImportModal />
      <CommandPalette />
      <UpdatePrompt />
      <Toasts />
      {onboarding && <Onboarding onDone={() => setOnboarding(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
