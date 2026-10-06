import { useEffect } from "react";
import { HashRouter, Route, Routes, useLocation } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { TitleBar } from "./components/TitleBar";
import { PlayPage } from "./routes/PlayPage";
import { InstancesPage } from "./routes/InstancesPage";
import { AccountPage } from "./routes/AccountPage";
import { SettingsPage } from "./routes/SettingsPage";
import { ContentPage } from "./routes/ContentPage";
import { InstanceDetailPage } from "./routes/InstanceDetailPage";
import { TogetherPage } from "./routes/TogetherPage";
import { useBackgroundStore } from "./store/backgroundStore";

function AppShell() {
  const location = useLocation();
  const { image, refresh } = useBackgroundStore();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const showBackground = location.pathname === "/" && !!image;

  return (
    <div className="h-screen w-screen flex flex-col relative">
      {showBackground && (
        <div
          className="fixed inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${image})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/60" />
        </div>
      )}

      <div className="relative z-10 flex flex-col h-full">
        <TitleBar transparent={showBackground} />
        <div className="flex-1 flex min-h-0">
          <Sidebar transparent={showBackground} />
          <main className="flex-1 overflow-y-auto min-w-0">
            <Routes>
              <Route path="/" element={<PlayPage />} />
              <Route path="/instances" element={<InstancesPage />} />
              <Route path="/instances/:instanceId" element={<InstanceDetailPage />} />
              <Route path="/content" element={<ContentPage />} />
              <Route path="/together" element={<TogetherPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
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
