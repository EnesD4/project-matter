import type { IncomingMessage, ServerResponse } from "http";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import { handleGeminiCoach } from "./api/_lib/geminiCoach";
import { handleCreateLinkToken, handleExchangeToken, handleGetAccounts } from "./api/_lib/plaidHandlers";
import { handlePlaidSync } from "./api/_lib/plaidSync";

function writeProxyDown(res: ServerResponse, err: Error) {
  if (res.headersSent) return;
  res.writeHead(502, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error:
        "Request failed — the API server is not reachable. Start the backend on port 5000.",
      detail: err.message,
    })
  );
}

const apiProxy = {
  "/api": {
    target: "http://127.0.0.1:5000",
    changeOrigin: true,
    bypass(req: IncomingMessage) {
      const url = pathOf(req);
      if (
        url === "/api/gemini-coach" ||
        url === "/api/plaid-sync" ||
        url.startsWith("/api/plaid/")
      ) {
        return url;
      }
    },
    configure(proxy: {
      on: (event: "error", handler: (err: Error, req: IncomingMessage, res: ServerResponse) => void) => void;
    }) {
      proxy.on("error", (err, _req, res) => writeProxyDown(res, err));
    },
  },
};

function pathOf(req: IncomingMessage): string {
  const raw = req.url || "";
  try {
    const path = raw.includes("://") ? new URL(raw).pathname : raw.split("?")[0] || "";
    return path.replace(/\/+$/, "") || "/";
  } catch {
    return (raw.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  }
}

function localServerlessApi(): Plugin {
  const attach = (server: ViteDevServer) => {
    server.middlewares.use((req, res, next) => {
      const path = pathOf(req);
      const handler =
        path === "/api/gemini-coach"
          ? handleGeminiCoach
          : path === "/api/plaid-sync"
            ? handlePlaidSync
            : path === "/api/plaid/create-link-token"
              ? handleCreateLinkToken
              : path === "/api/plaid/exchange-token"
                ? handleExchangeToken
                : path === "/api/plaid/accounts"
                  ? handleGetAccounts
                  : null;

      if (!handler) {
        next();
        return;
      }

      void handler(req, res).catch((error) => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Serverless route failed" }));
        }
      });
    });
  };

  return {
    name: "local-serverless-api",
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(env)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  return {
    plugins: [react(), localServerlessApi()],
    envPrefix: ["VITE_"],
    server: {
      host: "0.0.0.0",
      cors: true,
      allowedHosts: true,
      proxy: apiProxy,
    },
    preview: {
      host: "0.0.0.0",
      cors: true,
      allowedHosts: true,
      proxy: apiProxy,
    },
  };
});
