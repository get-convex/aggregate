import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { MantineProvider } from "@mantine/core";
import "./index.css";
import App from "./App.tsx";
import { RouteProvider } from "./routes.ts";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider
      theme={{
        colors: {
          dark: [
            "#C1C2C5",
            "#A6A7AB",
            "#909296",
            "#5C5F66",
            "#373A40",
            "#2C2E33",
            "#25262B",
            "#1A1B1E",
            "#141517",
            "#101113",
          ],
        },
      }}
    >
      <ConvexProvider client={convex}>
        <RouteProvider>
          <App />
        </RouteProvider>
      </ConvexProvider>
    </MantineProvider>
  </StrictMode>
);
