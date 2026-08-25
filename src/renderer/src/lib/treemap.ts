export interface TreemapRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Minimal squarified treemap (Bruls et al.): lays out `values` (sorted or not)
 * into rects filling width×height. Returns rects aligned with the input order.
 */
export function squarify(values: number[], width: number, height: number): TreemapRect[] {
  const total = values.reduce((a, v) => a + Math.max(0, v), 0)
  const out: TreemapRect[] = values.map(() => ({ x: 0, y: 0, w: 0, h: 0 }))
  if (total <= 0 || width <= 0 || height <= 0) return out

  // Work on indices sorted descending — squarify needs monotone input.
  const order = values.map((v, i) => i).sort((a, b) => values[b] - values[a])
  const areas = order.map((i) => (Math.max(0, values[i]) / total) * width * height)

  let x = 0
  let y = 0
  let w = width
  let h = height
  let start = 0

  const worst = (rowAreas: number[], side: number): number => {
    const sum = rowAreas.reduce((a, v) => a + v, 0)
    const max = Math.max(...rowAreas)
    const min = Math.min(...rowAreas)
    const s2 = sum * sum
    return Math.max((side * side * max) / s2, s2 / (side * side * min))
  }

  const layoutRow = (rowAreas: number[]): void => {
    const sum = rowAreas.reduce((a, v) => a + v, 0)
    const horizontal = w >= h
    const side = horizontal ? h : w
    const thickness = side > 0 ? sum / side : 0
    let offset = 0
    for (let r = 0; r < rowAreas.length; r++) {
      const len = thickness > 0 ? rowAreas[r] / thickness : 0
      const idx = order[start + r]
      out[idx] = horizontal
        ? { x, y: y + offset, w: thickness, h: len }
        : { x: x + offset, y, w: len, h: thickness }
      offset += len
    }
    if (horizontal) {
      x += thickness
      w -= thickness
    } else {
      y += thickness
      h -= thickness
    }
    start += rowAreas.length
  }

  let row: number[] = []
  for (let i = 0; i < areas.length; i++) {
    const side = Math.min(w, h)
    const candidate = [...row, areas[i]]
    if (row.length === 0 || worst(candidate, side) <= worst(row, side)) {
      row = candidate
    } else {
      layoutRow(row)
      row = [areas[i]]
    }
  }
  if (row.length > 0) layoutRow(row)
  return out
}

/** %change → red→gray→green fill for heatmap tiles (clamped at ±3%). */
export function heatColor(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '#1a1a1a'
  const t = Math.max(-1, Math.min(1, pct / 3))
  const mix = (a: number, b: number, f: number): number => Math.round(a + (b - a) * f)
  const gray = [38, 38, 38]
  const target = t >= 0 ? [0, 120, 60] : [140, 20, 40]
  const f = Math.abs(t)
  return `rgb(${mix(gray[0], target[0], f)}, ${mix(gray[1], target[1], f)}, ${mix(gray[2], target[2], f)})`
}
