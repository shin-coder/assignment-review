import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { createDefaultDeps } from "./app/defaultDeps";

const root = document.getElementById("root");
if (!root) {
  throw new Error("#root が見つかりません");
}

createRoot(root).render(
  <StrictMode>
    <App deps={createDefaultDeps()} />
  </StrictMode>,
);
