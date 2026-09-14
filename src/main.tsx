// Native Prototype Defensive Shield — MUST be the first import (before App/components).
// Polyfill lives in this module because ESM hoists imports; inline code above imports runs too late.
import "./lib/nativePrototypeShield";

import React from "react";
import ReactDOM from "react-dom/client";
import App from "../App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary label="your dashboard">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
