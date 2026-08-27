import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ErrorBoundary from '../components/ErrorBoundary'
import { PanelContent } from '../components/PanelGrid'
import { liveDebugCounts } from './live'

/**
 * DEV-ONLY leak harness (?leaktest=1, set via OT_LEAKTEST=1 npm run dev).
 * Mounts and unmounts every panel type 20× in a hidden container and logs
 * heap + live-store listener counts so regressions show up as monotonic growth.
 */

const PANELS: Array<{ fn: string; ticker: string | null }> = [
  { fn: 'QM', ticker: 'AAPL' },
  { fn: 'DES', ticker: 'AAPL' },
  { fn: 'GP', ticker: 'AAPL' },
  { fn: 'GIP', ticker: 'AAPL' },
  { fn: 'N', ticker: 'AAPL' },
  { fn: 'TOP', ticker: null },
  { fn: 'FA', ticker: 'AAPL' },
  { fn: 'ERN', ticker: 'AAPL' },
  { fn: 'DVD', ticker: 'AAPL' },
  { fn: 'CACS', ticker: 'AAPL' },
  { fn: 'HP', ticker: 'AAPL' },
  { fn: 'ECAL', ticker: null },
  { fn: 'INSD', ticker: null },
  { fn: 'WIRE', ticker: null },
  { fn: 'SPACE', ticker: null },
  { fn: 'FLT', ticker: null },
  { fn: 'MSG', ticker: 'AAPL' },
  { fn: 'W', ticker: null },
  { fn: 'WEI', ticker: null },
  { fn: 'MOST', ticker: null },
  { fn: 'EQS', ticker: null },
  { fn: 'PORT', ticker: null },
  { fn: 'ALRT', ticker: null },
  { fn: 'ECO', ticker: null },
  { fn: 'GC', ticker: null },
  { fn: 'HMAP', ticker: null },
  { fn: 'FX', ticker: null },
  { fn: 'CRYP', ticker: null },
  { fn: 'OPT', ticker: 'AAPL' },
  { fn: 'HELP', ticker: null },
  { fn: 'SET', ticker: null }
]

const CYCLES = 20

const heapMB = (): number => {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
  return mem ? Math.round(mem.usedJSHeapSize / 1048576) : -1
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function runLeakHarness(): Promise<void> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0, refetchOnWindowFocus: false, staleTime: 60_000 } } })
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-2000px;top:0;width:600px;height:400px;overflow:hidden'
  document.body.appendChild(host)
  console.error(`[leaktest] start — baseline heap=${heapMB()}MB listeners=${JSON.stringify(liveDebugCounts())}`)

  for (const spec of PANELS) {
    let heap5 = -1
    for (let i = 0; i < CYCLES; i++) {
      const mount = document.createElement('div')
      mount.style.cssText = 'width:600px;height:400px'
      host.appendChild(mount)
      const root = createRoot(mount)
      root.render(
        <QueryClientProvider client={client}>
          <ErrorBoundary>
            <PanelContent fn={spec.fn} ticker={spec.ticker} index={0} />
          </ErrorBoundary>
        </QueryClientProvider>
      )
      await sleep(40)
      root.unmount()
      mount.remove()
      if (i === 4) heap5 = heapMB()
    }
    await sleep(60)
    const counts = liveDebugCounts()
    console.error(
      `[leaktest] ${spec.fn}: heap@5=${heap5}MB heap@20=${heapMB()}MB liveListeners=${counts.totalListeners} liveSymbols=${counts.symbolsWithListeners}`
    )
  }
  host.remove()
  await sleep(500)
  console.error(`[leaktest] done — final heap=${heapMB()}MB listeners=${JSON.stringify(liveDebugCounts())}`)
}
