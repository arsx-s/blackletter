import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string;
}

function errorId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const isProd = import.meta.env.PROD;

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: "" };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? "" });
    console.error("[BlackLetter] Uncaught error:", error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (isProd) {
        return (
          <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
            <div className="max-w-md w-full text-center">
              <div className="w-12 h-12 mx-auto rounded-md bg-accent/15 border border-accent/25 flex items-center justify-center mb-6">
                <span className="font-display text-lg font-black text-accent">B</span>
              </div>
              <p className="font-mono text-2xs uppercase tracking-ultra text-muted mb-2">BlackLetter</p>
              <h1 className="font-display text-2xl font-black tracking-tight text-bone mb-3">
                BlackLetter encountered an unexpected error
              </h1>
              <p className="font-sans text-sm text-muted leading-relaxed mb-6">
                Your data is safe — this happens when something goes wrong on screen. Reload to continue, or start over.
              </p>
              <button
                onClick={() => location.reload()}
                className="px-5 py-2.5 rounded-sm bg-accent text-surface font-sans text-xs font-semibold hover:opacity-80 transition-opacity"
              >
                Reload BlackLetter
              </button>
              <p className="mt-5 font-mono text-2xs text-muted/50">Error ID: {errorId()}</p>
            </div>
          </div>
        );
      }
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-background p-6 font-mono">
          <div className="max-w-3xl w-full border border-border rounded-md bg-bone/[0.03] p-6">
            <p className="text-2xs uppercase tracking-ultra text-accent mb-2">BlackLetter crashed (development)</p>
            <h1 className="text-2xl font-black text-bone mb-4">
              {this.state.error.name}: {this.state.error.message}
            </h1>
            <pre className="text-xs text-muted whitespace-pre-wrap overflow-auto max-h-64 border border-border rounded-sm p-3 mb-3">
              {this.state.error.stack}
            </pre>
            <pre className="text-xs text-muted whitespace-pre-wrap overflow-auto max-h-64 border border-border rounded-sm p-3 mb-6">
              {this.state.componentStack}
            </pre>
            <button
              onClick={() => location.reload()}
              className="px-4 py-2 text-xs font-medium text-bone bg-accent rounded-md hover:opacity-80"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
