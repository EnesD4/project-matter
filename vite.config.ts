import type { IncomingMessage, ServerResponse } from "http";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";
import { handleGeminiCoach } from "./api/gemini-coach";
import handleCreateLinkToken from "./api/plaid/create-link-token.js";
import handleExchangeToken from "./api/plaid/exchange-token.js";
import handleGetAccounts from "./api/plaid/accounts.js";
import { handlePlaidSync } from "./api/plaid-sync";
import handleCashFlow from "./api/cash-flow";
import handleStockQuote from "./api/stocks/quote";
import handleStockQuotes from "./api/stocks/quotes";
import handleStockSearch from "./api/stocks/search";
import handleStockPath from "./api/_lib/stockHandlers";
import { handlePortfolioFallback, handleWatchlistsFallback } from "./api/_lib/resourceFallbacks";

function pathOf(req: IncomingMessage): string {
  const raw = req.url || "";
  try {
    const path = raw.includes("://") ? new URL(raw).pathname : raw.split("?")[0] || "";
    return path.replace(/\/+$/, "") || "/";
  } catch {
    return (raw.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

type ApiHandler = (req: any, res: any) => Promise<unknown>;

type ServerWithMiddleware = {
  middlewares: Connect.Server;
};

function localServerlessApi(): Plugin {
  const attach = (server: ServerWithMiddleware) => {
    server.middlewares.use((req, res, next) => {
      const path = pathOf(req);
      if (!path.startsWith("/api/")) {
        next();
        return;
      }

      let handler: ApiHandler | null = null;
      if (path === "/api/gemini-coach") handler = handleGeminiCoach;
      else if (path === "/api/plaid-sync") handler = handlePlaidSync;
      else if (path === "/api/plaid/create-link-token") handler = handleCreateLinkToken;
      else if (path === "/api/plaid/exchange-token") handler = handleExchangeToken;
      else if (path === "/api/plaid/accounts") handler = handleGetAccounts;
      else if (path === "/api/stocks/quote") handler = handleStockQuote;
      else if (path === "/api/stocks/quotes") handler = handleStockQuotes;
      else if (path === "/api/stocks/search") handler = handleStockSearch;
      else if (path === "/api/cash-flow") handler = handleCashFlow;
      else if (path === "/api/portfolio" || path.startsWith("/api/portfolio/")) handler = handlePortfolioFallback;
      else if (path === "/api/watchlists" || path.startsWith("/api/watchlists/")) handler = handleWatchlistsFallback;
      else if (path.startsWith("/api/stocks/")) handler = handleStockPath;

      if (!handler) {
        sendJson(res, 404, { error: "Not found" });
        return;
      }

      void handler(req, res).catch((error) => {
        if (!res.headersSent) {
          sendJson(res, 200, {
            error: error instanceof Error ? error.message : "Serverless route failed",
            data: [],
          });
        }
      });
    });
  };

  return {
    name: "local-serverless-api",
    configureServer(server) {
      if (typeof attach === "function") {
        attach(server);
      }
    },
    configurePreviewServer(server) {
      if (typeof attach === "function") {
        attach(server);
      }
    },
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
    build: {
      sourcemap: true,
    },
    server: {
      host: "0.0.0.0",
      cors: true,
      allowedHosts: true,
      sourcemapIgnoreList: () => false,
    },
    preview: {
      host: "0.0.0.0",
      cors: true,
      allowedHosts: true,
    },
  };
});
