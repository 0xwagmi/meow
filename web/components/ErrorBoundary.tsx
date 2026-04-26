"use client";

import { Component, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md w-full rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center space-y-3">
            <p className="text-red-400 font-semibold text-sm">Something went wrong</p>
            <p className="text-slate-400 text-xs font-mono break-all">
              {this.state.error.message}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-xl bg-slate-700 px-4 py-2 text-sm text-white hover:bg-slate-600 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
