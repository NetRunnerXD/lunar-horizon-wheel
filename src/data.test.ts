import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { metrics, series, type SiteData } from './metrics'

const load = (id: string): SiteData => JSON.parse(readFileSync(`public/data/sites/${id}.json`, 'utf8'))
const yr = (d: SiteData) => metrics(series(d, Date.parse('2027-01-01T00:00:00Z'), Date.parse('2028-01-01T00:00:00Z')), 1)

describe('real precomputed data (2027)', () => {
  const ids = JSON.parse(readFileSync('public/data/sites.json', 'utf8')).sites.map((s: { id: string }) => s.id) as string[]
  const all = Object.fromEntries(ids.map(id => [id, yr(load(id))]))
  it('prints summary', () => { console.table(Object.fromEntries(Object.entries(all).map(([k, m]) => [k, { sun: m.sunlitPct.toFixed(1), darkH: m.longestDarkH, earth: m.earthPct.toFixed(1), both: m.bothPct.toFixed(1) }]))) })
  it('Shackleton crater floor is (near) permanently shadowed', () => expect(all['shackleton'].sunlitPct).toBeLessThan(1))
  it('Shackleton rim high point is well illuminated', () => expect(all['shackleton-rim-high'].sunlitPct).toBeGreaterThan(50))
  it('Earth visible roughly half the time or less near the pole', () => expect(all['shackleton-rim-high'].earthPct).toBeLessThan(70))
  it('arrays are complete', () => { const d = load('mons-malapert'); expect(d.sun_az.length).toBe(d.n); expect(d.horizon.length).toBe(720) })
})
