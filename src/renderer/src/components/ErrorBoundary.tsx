import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="p-4 font-mono text-[11px]">
          <div className="uppercase text-term-down">Panel error</div>
          <div className="mt-1 text-term-dim">{this.state.error.message}</div>
          <button
            className="mt-3 border border-term-border px-2 py-1 uppercase text-term-amber hover:bg-[#1a1a1a]"
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
