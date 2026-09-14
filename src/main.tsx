const originalNumberToLocaleString = Number.prototype.toLocaleString;

Object.defineProperty(Object.prototype, "toLocaleString", {
  value: function (...args: any[]) {
    if (this === undefined || this === null) return "0";
    try {
      return originalNumberToLocaleString.call(Number(this || 0), ...args);
    } catch {
      return "0";
    }
  },
  configurable: true,
  writable: true,
});

Number.prototype.toLocaleString = function (locale?: any, options?: any) {
  if (this === undefined || this === null || isNaN(this as any)) {
    return "0";
  }
  try {
    return originalNumberToLocaleString.call(this, locale, options);
  } catch {
    return "0";
  }
};

// @ts-ignore
Object.defineProperty(Object.prototype, "safeVal", {
  value: function () {
    return this ?? 0;
  },
  writable: true,
  configurable: true,
});

import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "../App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import LoadingSpinner from "./components/LoadingSpinner";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary label="the app">
      <Suspense fallback={<LoadingSpinner fullScreen label="Starting Sprout…" />}>
        <App />
      </Suspense>
    </ErrorBoundary>
  </React.StrictMode>
);
