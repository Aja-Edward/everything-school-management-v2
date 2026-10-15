import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

async function bootstrap() {
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("Root element not found");

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  document.getElementById("loader")?.remove();
}

bootstrap().catch((error) => {
  console.error("Fatal: app failed to start", error);

  // Fail visibly rather than showing a blank screen
  document.getElementById("loader")?.remove();
  document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#555">
      <p>Something went wrong. Please refresh the page.</p>
    </div>
  `;
});