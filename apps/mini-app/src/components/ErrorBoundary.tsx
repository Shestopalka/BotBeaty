import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 24,
          background: 'var(--tg-theme-bg-color, #1a1a1a)',
          color: 'var(--tg-theme-text-color, #fff)',
          minHeight: '100vh',
          fontFamily: 'sans-serif',
        }}>
          <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: '#e05c5c' }}>
            ⚠️ Помилка додатку
          </p>
          <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 12 }}>
            {this.state.error.message}
          </p>
          <pre style={{
            fontSize: 11, opacity: 0.5, overflowX: 'auto',
            background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {this.state.error.stack?.split('\n').slice(0, 5).join('\n')}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16, padding: '10px 20px', borderRadius: 12,
              background: 'var(--tg-theme-button-color, #7a5af8)',
              color: 'var(--tg-theme-button-text-color, #fff)',
              border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Перезавантажити
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
