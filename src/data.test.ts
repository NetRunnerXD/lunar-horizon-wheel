import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { metrics, series, uncertainty, type SiteData, type Ephem } from './physics'

const P = JSON.parse(readFileSync('public/data/products.json', 'utf8'))
const buf = readFileSync('public/data/ephem.bin'), dbuf = readFileSync('public/data/dsn.bin')
const e: Ephem = { start: Date.parse(P.ephem.start), stepS: P.ephem.step_s, n: P.ephem.n,
  v: new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
  dsn: new Int16Array(dbuf.buffer.slice(dbuf.byteOffset, dbuf.byteOffset + dbuf.byteLength)), stations: [] }
const load = (id: string): SiteData => JSON.parse(readFileSync(`public/data/sites/${id}.json`, 'utf8'))
const A = Date.parse('2027-01-01T00:00:00Z'), B = Date.parse('2028-01-01T00:00:00Z')
const U = JSON.parse(readFileSync('public/data/uncertainty.json', 'utf8')).sites as { id: string; reference: { sunlit: number; earth: number } }[]

describe('real precomputed data (2027)', () => {
  const ids = JSON.parse(readFileSync('public/data/sites.json', 'utf8')).sites.map((s: { id: string }) => s.id) as string[]
  const all = Object.fromEntries(ids.map(id => [id, metrics(series(load(id), e, A, B, { stepMin: 30 }))]))
  it('Shackleton crater floor is permanently shadowed', () => expect(all['shackleton'].sunlitPct).toBeLessThan(1))
  it('Shackleton rim high point is well illuminated (80-90% literature range)', () => { expect(all['shackleton-rim-high'].sunlitPct).toBeGreaterThan(80); expect(all['shackleton-rim-high'].sunlitPct).toBeLessThan(92) })
  it('browser (TS, interpolated) matches pipeline (Python, direct SPICE) within 0.3 pp', () => {
    for (const u of U) { expect(Math.abs(all[u.id].sunlitPct - u.reference.sunlit)).toBeLessThan(0.3); expect(Math.abs(all[u.id].earthPct - u.reference.earth)).toBeLessThan(0.3) }
  })
  it('DSN coverage <= DTE coverage', () => { for (const id of ids) expect(all[id].dsnPct).toBeLessThanOrEqual(all[id].earthPct + 1e-9) })
  it('uncertainty range brackets the value', () => {
    const d = load('shackleton-rim-high'), m = metrics(series(d, e, A, A + 60 * 86400e3))
    const u = uncertainty(d, e, A, A + 60 * 86400e3, m)
    expect(u.sunlit.lo).toBeLessThanOrEqual(m.sunlitPct); expect(u.sunlit.hi).toBeGreaterThanOrEqual(m.sunlitPct); expect(u.demAvailable).toBe(true)
  })
})
