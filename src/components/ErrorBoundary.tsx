import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  /** Optional name shown in the fallback for context. */
  routeName?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface for debugging with rich context.
    const ctx = {
      route: this.props.routeName ?? 'unknown',
      path: typeof window !== 'undefined' ? window.location.pathname : 'n/a',
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a',
      componentStack: info.componentStack,
    };
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error.message, ctx, error);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-destructive/10 text-destructive flex items-center justify-center">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">Something went wrong</h2>
              {this.props.routeName && (
                <p className="text-xs text-muted-foreground">in {this.props.routeName}</p>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground break-words">
            {this.state.error.message || 'Unknown error.'}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={this.reset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Try again
            </Button>
            <Button size="sm" variant="outline" onClick={() => (window.location.href = '/')}>
              <Home className="h-4 w-4 mr-2" />
              Home
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
