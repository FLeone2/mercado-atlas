// A render error in one area must not blank the whole app: show a message and keep the shell usable.
import { Component } from 'react';

export class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { try { console.error('Erro de tela:', error, info?.componentStack); } catch { /* console may be unavailable */ } }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="ax-error-boundary" role="alert">
        <h2>Algo deu errado nesta tela</h2>
        <p>Seus filtros continuam no endereço da página. Tente de novo ou recarregue.</p>
        <p className="ax-error-detail">{String(this.state.error?.message ?? this.state.error).slice(0, 200)}</p>
        <div className="ax-error-actions">
          <button type="button" className="ax-button" onClick={() => this.setState({ error: null })}>Tentar de novo</button>
          <button type="button" className="ax-button" onClick={() => globalThis.location?.reload()}>Recarregar a página</button>
        </div>
      </div>
    );
  }
}
