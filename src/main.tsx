import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource-variable/unbounded";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// L'écran de démarrage (dans index.html) s'efface une fois l'interface affichée.
requestAnimationFrame(() => {
  const splash = document.getElementById("splash");
  if (!splash) return;
  splash.classList.add("splash-hide");
  setTimeout(() => splash.remove(), 450);
});
