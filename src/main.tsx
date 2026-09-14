import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../App';
import './index.css';

type BoundaryState = { error: Error | null };

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-black px-6 text-center text-white">
        <div>
          <p className="text-sm font-extrabold tracking-tight">Couldn&apos;t load your dashboard</p>
          <p className="mt-2 max-w-xs text-sm text-slate-400">
            Your session is saved. Reload to continue, or sign in again if this keeps happening.
          </p>
          <button
            type="button"
            className="mt-5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
