import { Component, type ReactNode, type ErrorInfo } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] Caught:", error.message, info.componentStack);
    this.props.onError?.(error, info);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <div className="w-14 h-14 rounded-xl border border-border bg-bone/[0.03] flex items-center justify-center mb-5">
            <AlertCircle size={24} className="text-muted/70" />
          </div>
          <p className="font-display text-lg font-semibold text-bone mb-2">This section crashed</p>
          <p className="font-sans text-sm text-muted max-w-sm mb-6 leading-relaxed">
            A component failed unexpectedly. The rest of your workspace is unaffected.
          </p>
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 border border-accent/20 text-accent font-sans text-sm hover:bg-accent/20 transition-colors"
          >
            <RefreshCw size={14} />
            Reload
          </button>
          {this.state.error && (
            <details className="mt-4 max-w-md">
              <summary className="font-mono text-2xs text-muted/50 cursor-pointer hover:text-muted/70">Error details</summary>
              <pre className="mt-2 font-mono text-2xs text-muted/40 text-left whitespace-pre-wrap break-all">
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
