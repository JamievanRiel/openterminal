import { useWorkspace } from '../state/workspace'
import TerminalChart, { defaultChartSettings } from '../components/chart/TerminalChart'

/**
 * GP / GIP — both are configurations of the same TerminalChart. Settings live
 * on the panel's workspace state so they persist per panel across restarts,
 * and survive link-group ticker swaps.
 */
export default function ChartPanel({
  ticker,
  variant,
  panelIndex
}: {
  ticker: string
  variant: 'GP' | 'GIP'
  panelIndex: number
}): JSX.Element {
  const panel = useWorkspace((s) => s.panels[panelIndex])
  const activePanel = useWorkspace((s) => s.activePanel)
  const updatePanelChart = useWorkspace((s) => s.updatePanelChart)

  const settings = panel?.chart ?? defaultChartSettings(variant)

  return (
    <TerminalChart
      symbol={ticker}
      settings={settings}
      onSettings={(next) => updatePanelChart(panelIndex, next)}
      variant={variant}
      isActivePanel={panelIndex === activePanel}
    />
  )
}
