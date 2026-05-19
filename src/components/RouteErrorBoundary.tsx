import { Component, type ErrorInfo, type ReactNode } from "react";
import { logError } from "@/lib/logger";

type Props = { children: ReactNode; routeName?: string };
type State = { error: unknown };

/**
 * Per-route boundary. Keeps the app shell alive when a single page throws,
 * and routes the error through the shared logger so we get one consistent
 * format in the console (and later: Sentry / Slack).
 *
 * Re-thrown chunk-load errors are intentionally NOT caught here — those are
 * handled by ChunkErrorBoundary at the app root.
 */
export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    logError(`route:${this.props.routeName ?? "unknown"}`, error, {
      componentStack: info.componentStack,
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    const message = this.state.error instanceof Error ? this.state.error.message : String(this.state.error);
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold">Something went wrong on this page</h1>
          <p className="text-sm text-muted-foreground break-words">{message}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={this.reset}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm"
            >
              Try again
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              className="px-4 py-2 rounded-md border text-sm"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
