import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import PopoutApp from './PopoutApp'
import './styles/index.css'

const isPopout = new URLSearchParams(window.location.search).has('popout')

// Chromium fires this benign notice when an observed element resizes twice in
// one frame (lightweight-charts autoSize does this by design). Filter the
// noise so real errors stand out in logs.
window.addEventListener('error', (event) => {
  if (event.message?.includes('ResizeObserver loop')) event.stopImmediatePropagation()
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000
    }
  }
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>{isPopout ? <PopoutApp /> : <App />}</QueryClientProvider>
  </React.StrictMode>
)
