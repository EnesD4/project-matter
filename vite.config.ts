import type { IncomingMessage, ServerResponse } from "http";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import { handleGeminiCoach } from "./api/_lib/geminiCoach";
import { handleCreateLinkToken, handleExchangeToken, handleGetAccounts } from "./api/_lib/plaidHandlers";
import { handlePlaidSync } from "./api/_lib/plaidSync";
import handleCashFlow from "./api/cash-flow";
import handleStockQuote from "./api/stocks/quote";
import handleStockQuotes from "./api/stocks/quotes";

function writeProxyDown(res: ServerResponse, err: Error, req?: IncomingMessage) {
  if (res.headersSent) return;
  const path = req ? pathOf(req) : "";
  if (path === "/api/stocks/quote" || path.startsWith("/api/stocks/quote")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ c: 0, d: 0, dp: 0, h: 0, l: 0, o: 0, pc: 0, t: 0 }));
    return;
  }
  if (path === "/api/stocks/quotes") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ items: [] }));
    return;
  }
  if (path === "/api/cash-flow") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        monthlyIncome: 0,
        emergencyFund: 0,
        extraPayoff: 0,
        expenses: [],
        debts: [],
        safetyNet: null,
        updatedAt: 0,
      })
    );
    return;
  }
  if (path === "/api/portfolio" || path.startsWith("/api/portfolio/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify((req?.method || "GET").toUpperCase() === "GET" ? [] : { ok: true }));
    return;
  }
  if (path === "/api/watchlists" || path.startsWith("/api/watchlists/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify((req?.method || "GET").toUpperCase() === "GET" ? [] : { ok: true }));
    return;
  }
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
        url === "/api/stocks/quote" ||
        url === "/api/stocks/quotes" ||
        url === "/api/cash-flow" ||
        url.startsWith("/api/plaid/")
      ) {
        return url;
      }
    },
    configure(proxy: {
      on: (event: "error", handler: (err: Error, req: IncomingMessage, res: ServerResponse) => void) => void;
    }) {
      proxy.on("error", (err, req, res) => writeProxyDown(res, err, req));
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
                  : path === "/api/stocks/quote"
                    ? handleStockQuote
                    : path === "/api/stocks/quotes"
                      ? handleStockQuotes
                      : path === "/api/cash-flow"
                        ? handleCashFlow
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
