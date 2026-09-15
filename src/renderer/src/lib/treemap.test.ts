import { describe, expect, it } from 'vitest'
import { heatColor, squarify, type TreemapRect } from './treemap'

const W = 400
const H = 300
const area = (r: TreemapRect): number => r.w * r.h

const overlaps = (a: TreemapRect, b: TreemapRect): boolean =>
  a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6

describe('squarify', () => {
  const values = [50, 30, 12, 5, 2, 1]

  it('returns one rect per value, aligned with the input order', () => {
    const rects = squarify(values, W, H)
    expect(rects).toHaveLength(values.length)
    // Input is unsorted on purpose: the biggest value must get the biggest rect.
    const shuffled = squarify([2, 50, 12], W, H)
    expect(area(shuffled[1])).toBeGreaterThan(area(shuffled[2]))
    expect(area(shuffled[2])).toBeGreaterThan(area(shuffled[0]))
  })

  it('sizes every rect in proportion to its value', () => {
    const rects = squarify(values, W, H)
    const total = values.reduce((a, v) => a + v, 0)
    rects.forEach((r, i) => expect(area(r) / (W * H)).toBeCloseTo(values[i] / total, 5))
  })

  it('tiles the whole box without gaps', () => {
    const covered = squarify(values, W, H).reduce((sum, r) => sum + area(r), 0)
    expect(covered).toBeCloseTo(W * H, 4)
  })

  it('keeps every rect inside the box', () => {
    for (const r of squarify(values, W, H)) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-9)
      expect(r.y).toBeGreaterThanOrEqual(-1e-9)
      expect(r.x + r.w).toBeLessThanOrEqual(W + 1e-6)
      expect(r.y + r.h).toBeLessThanOrEqual(H + 1e-6)
    }
  })

  it('never overlaps two rects', () => {
    const rects = squarify(values, W, H)
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i], rects[j])).toBe(false)
      }
    }
  })

  it('gives a single value the entire box', () => {
    const [only] = squarify([42], W, H)
    expect(only).toEqual({ x: 0, y: 0, w: W, h: H })
  })

  it('treats negative values as empty rather than inverting a rect', () => {
    for (const values of [[10, -5], [1, -100, 1], [5, 5, -3]]) {
      const rects = squarify(values, W, H)
      const positives = values.reduce((sum, v) => sum + Math.max(0, v), 0)
      rects.forEach((r, i) => {
        // A negative slice gets no area, and the positives still tile the box.
        if (values[i] <= 0) expect(area(r)).toBe(0)
        else expect(area(r) / (W * H)).toBeCloseTo(values[i] / positives, 5)
        expect(r.w).toBeGreaterThanOrEqual(0)
        expect(r.h).toBeGreaterThanOrEqual(0)
      })
    }
  })

  it('returns empty rects instead of throwing on degenerate input', () => {
    expect(squarify([], W, H)).toEqual([])
    expect(squarify([0, 0], W, H)).toEqual([
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 0, w: 0, h: 0 }
    ])
    expect(squarify([1, 2], 0, H).every((r) => area(r) === 0)).toBe(true)
    expect(squarify([1, 2], W, -10).every((r) => area(r) === 0)).toBe(true)
  })
})

describe('heatColor', () => {
  const channels = (css: string): number[] => (css.match(/\d+/g) ?? []).map(Number)

  it('paints an unknown value neutral rather than green or red', () => {
    expect(heatColor(null)).toBe('#1a1a1a')
    expect(heatColor(undefined)).toBe('#1a1a1a')
    expect(heatColor(NaN)).toBe('#1a1a1a')
  })

  it('paints a flat value grey', () => {
    expect(channels(heatColor(0))).toEqual([38, 38, 38])
  })

  it('gets greener as the gain grows and redder as the loss deepens', () => {
    const [, gUp] = channels(heatColor(2))
    const [, gSmall] = channels(heatColor(0.5))
    expect(gUp).toBeGreaterThan(gSmall)
    const [rDown] = channels(heatColor(-2))
    const [rSmall] = channels(heatColor(-0.5))
    expect(rDown).toBeGreaterThan(rSmall)
  })

  it('separates a gain from a loss of the same size', () => {
    expect(heatColor(2)).not.toBe(heatColor(-2))
  })

  it('clamps beyond ±3% so an outlier cannot burn the scale', () => {
    expect(heatColor(3)).toBe(heatColor(50))
    expect(heatColor(-3)).toBe(heatColor(-50))
  })
})
