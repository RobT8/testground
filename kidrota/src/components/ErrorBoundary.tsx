import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence for a render crash.
 *
 * Without one, a thrown error unmounts the whole tree and leaves a blank white
 * screen with no way out — on a phone there is no console to check, so the
 * only recourse would be reinstalling.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="app-shell">
        <div className="screen">
          <h1 className="page-title">Something went wrong</h1>
          <p className="placeholder-note">
            KidRota hit a problem it could not recover from. Your saved plans are safe —
            reopening usually fixes it.
          </p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => window.location.reload()}
          >
            Reload KidRota
          </button>
          <p className="error-detail">{error.message}</p>
        </div>
      </div>
    );
  }
}
