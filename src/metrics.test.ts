import { describe, it, expect } from 'vitest'
import { horizonAt, sunFraction, runs, metrics, series, type SiteData } from './metrics'

describe('horizonAt', () => {
  const h = [0, 10, 20, 30] // step 90, bins centred at 45,135,225,315
  it('returns bin value at bin centre', () => expect(horizonAt(h, 90, 135)).toBeCloseTo(10))
  it('interpolates', () => expect(horizonAt(h, 90, 90)).toBeCloseTo(5))
  it('wraps around 360', () => expect(horizonAt(h, 90, 0)).toBeCloseTo(15))
  it('handles negatives', () => expect(horizonAt(h, 90, -45)).toBeCloseTo(30))
})
describe('sunFraction', () => {
  it('0 when fully below', () => expect(sunFraction(-1, 0)).toBe(0))
  it('1 when fully above', () => expect(sunFraction(1, 0)).toBe(1))
  it('0.5 at centre', () => expect(sunFraction(2, 2)).toBeCloseTo(0.5))
})
describe('runs', () => {
  it('finds runs including tail', () => expect(runs([true, true, false, true])).toEqual([{ start: 0, end: 2 }, { start: 3, end: 4 }]))
})
describe('metrics', () => {
  const n = 10
  const d: SiteData = {
    id: 'x', name: 'x', lat: -89, lon: 0, kind: 'test', note: '', elevation_m: 0, dem: '',
    start: '2026-01-01T00:00:00Z', step_hours: 1, n, horizon_step_deg: 90, horizon: [0, 0, 0, 0],
    sun_az: Array(n).fill(0), sun_el: [100, 100, -100, -100, -100, 100, 100, 100, 100, 100],
    earth_az: Array(n).fill(0), earth_el: [100, -100, 100, 100, -100, -100, 100, 100, 100, 100],
  }
  const s = series(d, Date.parse('2026-01-01T00:00:00Z'), Date.parse('2026-01-01T10:00:00Z'))
  const m = metrics(s, 1)
  it('sunlit', () => expect(m.sunlitPct).toBeCloseTo(70))
  it('longest dark', () => expect(m.longestDarkH).toBe(3))
  it('earth pct and windows', () => { expect(m.earthPct).toBeCloseTo(70); expect(m.dteWindows.map(w => w.hours)).toEqual([1, 2, 4]) })
  it('both', () => expect(m.bothPct).toBeCloseTo(50))
  it('respects range', () => expect(series(d, Date.parse('2026-01-01T02:00:00Z'), Date.parse('2026-01-01T05:00:00Z')).t.length).toBe(3))
})
