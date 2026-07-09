/**
 * @collabtext/client — Vite entry.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "./components/Editor.js";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <Editor />
  </StrictMode>,
);
