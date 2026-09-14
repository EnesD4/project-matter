import React from "react";

type BoundaryState = { error: Error | null };

type ErrorBoundaryProps = {
  children: React.ReactNode;
  /** Optional label shown in the fallback (e.g. "dashboard"). */
  label?: string;
};

/**
 * Catches render errors in the subtree and shows a clean fallback
 * instead of blanking the entire screen.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", this.props.label ?? "app", error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const label = this.props.label ?? "this screen";

    return (
      <div className="grid min-h-[40vh] place-items-center bg-black px-6 py-10 text-center text-white">
        <div>
          <p className="text-sm font-extrabold tracking-tight">Couldn&apos;t load {label}</p>
          <p className="mt-2 max-w-xs text-sm text-slate-400">
            Your session is saved. Try again, or reload if this keeps happening.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950"
              onClick={this.reset}
            >
              Try again
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold text-white"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
