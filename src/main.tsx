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

// L'écran de démarrage (dans index.html) est retiré par la transition d'ouverture, dans App.
// Filet de sécurité : si l'interface n'a pas pu démarrer, il ne reste pas affiché indéfiniment.
setTimeout(() => {
  const splash = document.getElementById("splash");
  if (!splash) return;
  splash.classList.add("splash-hide");
  setTimeout(() => splash.remove(), 450);
}, 6000);
