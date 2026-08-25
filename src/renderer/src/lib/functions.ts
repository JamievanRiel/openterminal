import { FUNCTION_REGISTRY, type FnEntry } from '../../../shared/functionRegistry'

export type FnDef = FnEntry

/** Keyed view of the shared registry — autocomplete and HELP read the same source. */
export const FUNCTIONS: Record<string, FnDef> = Object.fromEntries(FUNCTION_REGISTRY.map((f) => [f.code, f]))

export interface ParsedCommand {
  ticker: string | null
  fn: string | null
  raw: string
}

export function parseCommand(input: string): ParsedCommand {
  const raw = input.trim().toUpperCase()
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { ticker: null, fn: null, raw }
  if (parts.length === 1) {
    const only = parts[0]
    if (FUNCTIONS[only]) return { ticker: null, fn: only, raw }
    return { ticker: only, fn: 'DES', raw }
  }
  const [first, second] = parts
  if (FUNCTIONS[second]) return { ticker: first, fn: second, raw }
  // fn-first with an argument: EQS <screen>, FX <pair>, WS <workspace>…
  if (FUNCTIONS[first]) return { ticker: second, fn: first, raw }
  return { ticker: first, fn: second, raw } // unknown fn, caller handles suggestion
}

function distance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return dp[a.length][b.length]
}

export function closestFunctions(code: string, count = 3): string[] {
  return Object.keys(FUNCTIONS)
    .map((c) => ({ c, d: distance(code, c) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, count)
    .map((x) => x.c)
}

/** Simple fuzzy match: query chars must appear in order (HELP search). */
export function fuzzyMatch(query: string, target: string): boolean {
  const q = query.toUpperCase()
  const t = target.toUpperCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}
