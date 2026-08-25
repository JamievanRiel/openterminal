import { create } from 'zustand'
import type { ChartSettings, PanelState, WorkspaceSnapshot } from '../../../shared/types'
import { invoke } from '../lib/ipc'

export type LayoutPreset = 1 | 2 | 4 | 6

interface WorkspaceLoadResult {
  active: string
  names: string[]
  snapshot: WorkspaceSnapshot | null
}

interface WorkspaceStore {
  layout: LayoutPreset
  panels: PanelState[]
  activePanel: number
  hydrated: boolean
  workspaceName: string
  workspaceNames: string[]
  hydrate: () => Promise<void>
  setLayout: (layout: LayoutPreset) => void
  setActive: (index: number) => void
  cycleActive: () => void
  applyCommand: (fn: string, ticker: string | null, newPanel: boolean) => void
  loadTicker: (ticker: string) => void
  addPanel: (panel: PanelState) => void
  popOutPanel: (index: number) => void
  updatePanelChart: (index: number, chart: ChartSettings) => void
  closePanel: (index: number) => void
  switchWorkspace: (name: string) => Promise<'switched' | 'created'>
  saveWorkspaceAs: (name: string) => Promise<void>
  deleteWorkspace: (name: string) => Promise<void>
}

/** Pop-out windows render one fixed panel and must never write workspace state. */
export const IS_POPOUT = new URLSearchParams(window.location.search).has('popout')

let panelSeq = 100
const defaultPanels = (n: number): PanelState[] =>
  Array.from({ length: n }, (_, i) => ({ id: ++panelSeq, fn: i === 0 ? 'HELP' : 'EMPTY', ticker: null }))

const snapshotOf = (state: WorkspaceStore): WorkspaceSnapshot => ({
  layout: state.layout,
  panels: state.panels,
  activePanel: state.activePanel
})

// Current workspace autosaves on every change, debounced 2s. Pop-outs never persist.
let persistTimer: number | undefined
function persist(state: WorkspaceStore): void {
  if (IS_POPOUT) return
  window.clearTimeout(persistTimer)
  const snapshot = snapshotOf(state)
  persistTimer = window.setTimeout(() => {
    void invoke('workspace:save', snapshot).catch(() => undefined)
  }, 2000)
}

function persistNow(state: WorkspaceStore): Promise<unknown> {
  if (IS_POPOUT) return Promise.resolve()
  window.clearTimeout(persistTimer)
  return invoke('workspace:save', snapshotOf(state)).catch(() => undefined)
}

function applySnapshot(
  set: (partial: Partial<WorkspaceStore>) => void,
  snapshot: WorkspaceSnapshot | null,
  name: string,
  names: string[]
): void {
  if (snapshot && snapshot.panels.length > 0) {
    panelSeq = Math.max(...snapshot.panels.map((p) => p.id), panelSeq)
    set({
      layout: (snapshot.layout as LayoutPreset) || 2,
      panels: snapshot.panels,
      activePanel: Math.min(snapshot.activePanel, snapshot.panels.length - 1),
      workspaceName: name,
      workspaceNames: names,
      hydrated: true
    })
  } else {
    set({ layout: 2, panels: defaultPanels(2), activePanel: 0, workspaceName: name, workspaceNames: names, hydrated: true })
  }
}

export const useWorkspace = create<WorkspaceStore>((set, get) => ({
  layout: 2,
  panels: defaultPanels(2),
  activePanel: 0,
  hydrated: false,
  workspaceName: 'MAIN',
  workspaceNames: ['MAIN'],

  hydrate: async () => {
    try {
      const result = await invoke<WorkspaceLoadResult>('workspace:load')
      applySnapshot(set, result.snapshot, result.active, result.names.length > 0 ? result.names : [result.active])
      return
    } catch {
      /* fresh start */
    }
    set({ hydrated: true })
  },

  setLayout: (layout) => {
    const { panels } = get()
    const next = panels.slice(0, layout)
    while (next.length < layout) next.push({ id: ++panelSeq, fn: 'EMPTY', ticker: null })
    set({ layout, panels: next, activePanel: Math.min(get().activePanel, layout - 1) })
    persist(get())
  },

  setActive: (index) => {
    set({ activePanel: index })
    persist(get())
  },

  cycleActive: () => {
    const { activePanel, panels } = get()
    set({ activePanel: (activePanel + 1) % panels.length })
  },

  applyCommand: (fn, ticker, newPanel) => {
    const { panels, activePanel, layout } = get()
    if (newPanel && panels.length < 6) {
      const nextPanels = [...panels, { id: ++panelSeq, fn, ticker }]
      const nextLayout = (nextPanels.length <= 2 ? nextPanels.length : nextPanels.length <= 4 ? 4 : 6) as LayoutPreset
      set({ panels: nextPanels, layout: nextLayout, activePanel: nextPanels.length - 1 })
    } else {
      // Switching function resets that panel's chart config (GP and GIP have different presets).
      const nextPanels = panels.map((p, i) =>
        i === activePanel ? { ...p, fn, ticker: ticker ?? p.ticker, chart: fn === p.fn ? p.chart : undefined } : p
      )
      set({ panels: nextPanels, layout })
    }
    persist(get())
  },

  // "Active link group": clicking a symbol loads it into the active panel and
  // propagates to every window's link-group panels via main.
  loadTicker: (ticker) => {
    if (IS_POPOUT) {
      // A pop-out has no grid — hand the change to main to broadcast.
      void invoke('link:set-ticker', { ticker }).catch(() => undefined)
      return
    }
    const { panels, activePanel } = get()
    const current = panels[activePanel]
    const tickerFns = ['DES', 'Q', 'QM', 'GP', 'GIP', 'N', 'FA', 'ERN', 'DVD', 'CACS', 'HP', 'MSG']
    const fn = current && tickerFns.includes(current.fn) ? current.fn : 'QM'
    const nextPanels = panels.map((p, i) => (i === activePanel ? { ...p, fn, ticker } : p))
    set({ panels: nextPanels })
    persist(get())
    void invoke('link:set-ticker', { ticker }).catch(() => undefined)
  },

  // A pop-out window closed: its panel returns to the first free slot.
  addPanel: (panel: PanelState) => {
    const { panels } = get()
    const emptyIdx = panels.findIndex((p) => p.fn === 'EMPTY')
    let nextPanels: PanelState[]
    if (emptyIdx >= 0) {
      nextPanels = panels.map((p, i) => (i === emptyIdx ? panel : p))
    } else if (panels.length < 6) {
      nextPanels = [...panels, panel]
    } else {
      return // grid full — panel stays removed
    }
    const nextLayout = (nextPanels.length <= 2 ? nextPanels.length : nextPanels.length <= 4 ? 4 : 6) as LayoutPreset
    set({ panels: nextPanels, layout: Math.max(nextLayout, get().layout) as LayoutPreset })
    persist(get())
  },

  // Pop out the given panel: hand it to main, free the grid slot.
  popOutPanel: (index: number) => {
    const { panels } = get()
    const panel = panels[index]
    if (!panel || panel.fn === 'EMPTY') return
    void invoke('panel:popout', panel).catch(() => undefined)
    if (panels.length <= 1) {
      set({ panels: [{ id: ++panelSeq, fn: 'EMPTY', ticker: null }] })
    } else {
      const nextPanels = panels.filter((_, i) => i !== index)
      set({
        panels: nextPanels,
        layout: nextPanels.length as LayoutPreset,
        activePanel: Math.min(get().activePanel, nextPanels.length - 1)
      })
    }
    persist(get())
  },

  updatePanelChart: (index, chart) => {
    set({ panels: get().panels.map((p, i) => (i === index ? { ...p, chart } : p)) })
    persist(get())
  },

  closePanel: (index) => {
    const { panels } = get()
    if (panels.length <= 1) return
    const nextPanels = panels.filter((_, i) => i !== index)
    set({
      panels: nextPanels,
      layout: nextPanels.length as LayoutPreset,
      activePanel: Math.min(get().activePanel, nextPanels.length - 1)
    })
    persist(get())
  },

  // WS <name>: persist the current workspace, then restore (or create) the target.
  switchWorkspace: async (name) => {
    await persistNow(get())
    const result = await invoke<WorkspaceLoadResult & { created: boolean }>('workspace:switch', { name: name.toUpperCase() })
    applySnapshot(set, result.snapshot, result.active, result.names)
    if (result.created) {
      // A brand-new workspace starts from the current layout; save it immediately.
      await persistNow(get())
      return 'created'
    }
    return 'switched'
  },

  // WS SAVE <name>: store the current state under a (new) name and make it active.
  saveWorkspaceAs: async (name) => {
    await invoke('workspace:switch', { name: name.toUpperCase() })
    await persistNow(get())
    const list = await invoke<{ active: string; names: string[] }>('workspace:list')
    set({ workspaceName: list.active, workspaceNames: list.names })
  },

  deleteWorkspace: async (name) => {
    const result = await invoke<{ active: string; names: string[] }>('workspace:delete', { name: name.toUpperCase() })
    if (result.active !== get().workspaceName) {
      const switched = await invoke<WorkspaceLoadResult & { created: boolean }>('workspace:switch', { name: result.active })
      applySnapshot(set, switched.snapshot, switched.active, switched.names)
    } else {
      set({ workspaceNames: result.names })
    }
  }
}))
