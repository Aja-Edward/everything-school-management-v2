import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { initI18n } from "./i18n";  


async function bootstrap() {
  await initI18n();

  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("Root element not found");

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>
  );

  // 🔥 remove loader
  const loader = document.getElementById("loader");
  if (loader) loader.remove();
}

bootstrap();

