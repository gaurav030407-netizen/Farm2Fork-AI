import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';

export interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  /** Changing this clears a caught error. Pass the route to recover on navigation. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

function DefaultFallback({ resetError }: ErrorFallbackProps) {
  return (
    <div className="min-h-[50vh] w-full flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 text-center shadow-xs">
        <h2 className="text-lg font-bold text-[hsl(var(--foreground))]">
          Unable to load this section
        </h2>
        <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
          An unexpected error occurred while loading this view. The rest of the application remains available.
        </p>
        <button
          type="button"
          onClick={resetError}
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-[hsl(var(--primary))] px-4 py-2 text-xs font-semibold text-white hover:bg-[hsl(var(--primary)/.9)]"
        >
          Reload section
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(
      'ErrorBoundary caught an error:',
      toError(error),
      info.componentStack,
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.resetError();
    }
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    const Fallback = this.props.FallbackComponent ?? DefaultFallback;
    return <Fallback error={error} resetError={this.resetError} />;
  }
}
