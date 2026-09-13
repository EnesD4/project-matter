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
      const url = req.url || "";
      if (
        url.startsWith("/api/gemini-coach") ||
        url.startsWith("/api/plaid-sync") ||
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
  return raw.split("?")[0] || "";
}

function localServerlessApi(): Plugin {
  const attach = (server: ViteDevServer) => {
    server.middlewares.use(async (req, res, next) => {
      const path = pathOf(req);
      try {
        if (path === "/api/gemini-coach") {
          await handleGeminiCoach(req, res);
          return;
        }
        if (path === "/api/plaid-sync") {
          await handlePlaidSync(req, res);
          return;
        }
        if (path === "/api/plaid/create-link-token") {
          await handleCreateLinkToken(req, res);
          return;
        }
        if (path === "/api/plaid/exchange-token") {
          await handleExchangeToken(req, res);
          return;
        }
        if (path === "/api/plaid/accounts") {
          await handleGetAccounts(req, res);
          return;
        }
      } catch (error) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Serverless route failed" }));
        }
        return;
      }
      next();
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
