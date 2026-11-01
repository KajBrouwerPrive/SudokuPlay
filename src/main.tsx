import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Tokens and base styles first, so component styles can build on them.
import "./styles/tokens.css";
import "./styles/base.css";
import { App } from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root is missing from index.html");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
