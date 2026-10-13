import { describe, it, expect } from 'vitest'
import { horizonAt, uniformFraction, limbFraction, sunFraction, runs, metrics, linkBudget, powerSizing, rank, gridSite, xyFromLatLon, latLonFromXY, interpVec, topo, enu, type Series, type Ephem, type Grid } from './physics'

describe('horizonAt', () => {
  const h = [0, 10, 20, 30]
  it('bin centre', () => expect(horizonAt(h, 90, 135)).toBeCloseTo(10))
  it('interpolates', () => expect(horizonAt(h, 90, 90)).toBeCloseTo(5))
  it('wraps', () => expect(horizonAt(h, 90, 0)).toBeCloseTo(15))
  it('negative az', () => expect(horizonAt(h, 90, -45)).toBeCloseTo(30))
})
describe('finite solar disk', () => {
  it('uniform: limits and half', () => { expect(uniformFraction(-1)).toBe(0); expect(uniformFraction(1)).toBe(1); expect(uniformFraction(0)).toBeCloseTo(0.5, 10) })
  it('uniform: analytic segment at d=0.5', () => expect(uniformFraction(0.5)).toBeCloseTo(1 - (Math.acos(0.5) - 0.5 * Math.sqrt(0.75)) / Math.PI, 10))
  it('uniform symmetric', () => { for (const d of [0.1, 0.37, 0.9]) expect(uniformFraction(d) + uniformFraction(-d)).toBeCloseTo(1, 10) })
  it('limb: half at centre, monotone, symmetric', () => {
    expect(limbFraction(0)).toBeCloseTo(0.5, 3)
    let prev = 0
    for (let d = -1; d <= 1.0001; d += 0.05) { const f = limbFraction(d); expect(f).toBeGreaterThanOrEqual(prev - 1e-12); prev = f }
    expect(limbFraction(0.4) + limbFraction(-0.4)).toBeCloseTo(1, 3)
  })
  it('limb darkening concentrates flux at centre: limb > uniform for 0<d<1', () => { expect(limbFraction(0.5)).toBeGreaterThan(uniformFraction(0.5)); expect(limbFraction(0.5)).toBeCloseTo(0.8225, 2) })
  it('model switch', () => { expect(sunFraction(0.1, 0, 0.27, 'point')).toBe(1); expect(sunFraction(0, 0, 0.27, 'linear')).toBeCloseTo(0.5) })
})
describe('ephemeris interpolation', () => {
  // vectors on a circle: Catmull-Rom on uniformly sampled circle should be accurate to ~1e-4 rad for 10 deg steps
  const n = 40, v = new Float32Array(n * 6)
  for (let i = 0; i < n; i++) { const a = i * 10 * Math.PI / 180; v.set([Math.cos(a), Math.sin(a), 0, 2 * Math.cos(a), 2 * Math.sin(a), 0], i * 6) }
  const e: Ephem = { start: 0, stepS: 3600, n, v, dsn: new Int16Array(n * 3), stations: [] }
  it('reproduces nodes', () => { const o = interpVec(e, 5, 0, [0, 0, 0]); expect(o[0]).toBeCloseTo(Math.cos(50 * Math.PI / 180), 5) })
  it('accurate between nodes', () => { const o = interpVec(e, 5.5, 3, [0, 0, 0]); const a = Math.atan2(o[1], o[0]) * 180 / Math.PI; expect(Math.abs(a - 55)).toBeLessThan(0.01) })
})
describe('topocentric', () => {
  it('zenith at south pole', () => { const f = enu(-90, 0); const t = topo([0, 0, -1000], [0, 0, -1], f); expect(t.el).toBeCloseTo(90) })
  it('north is toward the pole from a southern site', () => { const f = enu(-80, 0); const t = topo([0, 0, -1e6], [0, 0, 0], f); expect(t.az).toBeCloseTo(180, 0) })
})
describe('runs / metrics', () => {
  it('runs with tail', () => expect(runs([true, true, false, true])).toEqual([{ start: 0, end: 2 }, { start: 3, end: 4 }]))
  const n = 10, F = [1, 1, 0, 0, 0, 1, 1, 1, 1, 1], E = [1, 0, 1, 1, 0, 0, 1, 1, 1, 1].map(Boolean)
  const s: Series = { stepH: 1, t: [...Array(n).keys()].map(i => i * 3600e3), sunAz: Array(n).fill(0), sunEl: Array(n).fill(0), sunHz: Array(n).fill(0), sunFrac: F,
    sunDistKm: Array(n).fill(149597870.7), earthAz: Array(n).fill(0), earthEl: Array(n).fill(0), earthHz: Array(n).fill(0), earthVis: E, earthDistKm: Array(n).fill(384400),
    dsnEl: [Array(n).fill(20), Array(n).fill(0), Array(n).fill(0)], dsnVis: E }
  const m = metrics(s)
  it('sunlit / dark / earth / windows / both', () => {
    expect(m.sunlitPct).toBeCloseTo(70); expect(m.longestDarkH).toBe(3); expect(m.earthPct).toBeCloseTo(70)
    expect(m.dteWindows.map(w => w.hours)).toEqual([1, 2, 4]); expect(m.bothPct).toBeCloseTo(50); expect(m.dsnPct).toBeCloseTo(70)
  })
  it('battery sizing covers the 3 h night', () => {
    const p = powerSizing(s, { loadW: 100, panelM2: 1, eff: 0.3, batteryDod: 0.5, chargeEff: 1 })
    expect(p.deficitWh).toBeCloseTo(300); expect(p.batteryWh).toBeCloseTo(600); expect(p.longestDeficitH).toBe(3)
  })
})
describe('link budget', () => {
  const p = { band: 'X' as const, txPowerW: 10, txGainDbi: 10, lossesDb: 3, dsnDish: 34 as const, reqEbN0Db: 2.5, marginDb: 3 }
  it('free-space loss at lunar distance (X) ~ 222.6 dB', () => expect(linkBudget(p, 384400).fsplDb).toBeCloseTo(222.6, 0))
  it('doubling distance costs 6.02 dB / quarter rate', () => {
    const a = linkBudget(p, 384400), b = linkBudget(p, 768800)
    expect(a.fsplDb - b.fsplDb).toBeCloseTo(-6.02, 2); expect(a.maxRateBps / b.maxRateBps).toBeCloseTo(4, 3)
  })
  it('order of magnitude: Mbps class', () => { const r = linkBudget(p, 384400).maxRateBps; expect(r).toBeGreaterThan(1e6); expect(r).toBeLessThan(1e8) })
})
describe('ranking', () => {
  const rows = [{ id: 'a', sunlit: 90, dark: 50, earth: 50, dsn: 40, psrNear: 2, psrArea: 5 }, { id: 'b', sunlit: 30, dark: 500, earth: 90, dsn: 80, psrNear: 0.5, psrArea: 30 }]
  it('power prefers sunlit', () => expect(rank(rows, 'power')[0].id).toBe('a'))
  it('comms prefers Earth', () => expect(rank(rows, 'comms')[0].id).toBe('b'))
  it('psr prefers nearby PSR', () => expect(rank(rows, 'psr')[0].id).toBe('b'))
})
describe('projection & grid', () => {
  it('round trip', () => { const p = xyFromLatLon(-87.3, 123.4); const q = latLonFromXY(p.x, p.y); expect(q.lat).toBeCloseTo(-87.3, 8); expect(q.lon).toBeCloseTo(123.4, 8) })
  const g: Grid = { nx: 2, ny: 2, x0: 0, y0: 10, step_m: 10, bins: 2, elev_m: [0, 10, 20, 30], hz: new Int16Array([0, 0, 100, 100, 200, 200, 300, 300]) }
  it('bilinear blend', () => { const r = gridSite(g, 5, 5)!; expect(r.elevation_m).toBeCloseTo(15); expect(r.horizon[0]).toBeCloseTo(1.5) })
  it('outside is null', () => expect(gridSite(g, -1, 5)).toBeNull())
})
