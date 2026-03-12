import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: 40,
          maxWidth: 600,
          margin: '80px auto',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
          <h2 style={{ color: '#ef4444', marginBottom: 16 }}>Something went wrong</h2>
          <p style={{ color: '#666', marginBottom: 20, lineHeight: 1.5 }}>
            An error occurred while rendering the app. Your data is safe in localStorage.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            style={{
              padding: '8px 20px',
              background: '#6366f1',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              marginRight: 8,
              fontSize: 14,
            }}
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px',
              background: '#e5e7eb',
              color: '#374151',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Reload Page
          </button>
          {this.state.error && (
            <details style={{ marginTop: 24 }}>
              <summary style={{ cursor: 'pointer', color: '#6b7280', fontSize: 13 }}>
                Error details
              </summary>
              <pre style={{
                marginTop: 8,
                padding: 12,
                background: '#fef2f2',
                borderRadius: 6,
                fontSize: 12,
                overflow: 'auto',
                color: '#991b1b',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
