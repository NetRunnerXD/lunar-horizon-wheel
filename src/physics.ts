// Pure geometry / visibility / metric functions (browser + tests). Angles in degrees unless noted.
// Mirrors pipeline/geom.py; see METHODS.md for derivations and references.

export interface SiteMeta {
  id: string; name: string; lat: number; lon: number; kind: string; note: string
  elevation_m: number; dem: string
}
export interface SiteData extends SiteMeta {
  horizon_step_deg: number; mast_m: number; horizon: number[]; horizon_240m?: number[]
}
export interface Ephem { start: number; stepS: number; n: number; v: Float32Array; dsn: Int16Array; stations: string[] }

export const R_MOON_M = 1737400, R_SUN_KM = 695700, R_EARTH_KM = 6371, AU_KM = 149597870.7
export const LD_U = 0.56 // linear limb-darkening coefficient at 600 nm (Allen's Astrophysical Quantities)
export const DSN_MASK_DEG = 10
const D2R = Math.PI / 180

export function horizonAt(h: number[], step: number, az: number): number {
  const n = h.length
  const x = (((az % 360) + 360) % 360) / step - 0.5 // bins centred on (i+0.5)*step
  const i0 = Math.floor(x), f = x - i0
  const a = h[((i0 % n) + n) % n], b = h[(((i0 + 1) % n) + n) % n]
  return a + (b - a) * f
}

// ---------- finite solar disk ----------
/** Visible area fraction of a uniform disk whose centre is d radii above a straight horizon line. */
export function uniformFraction(d: number): number {
  if (d <= -1) return 0
  if (d >= 1) return 1
  return 1 - (Math.acos(d) - d * Math.sqrt(1 - d * d)) / Math.PI
}
/** Cumulative limb-darkened flux table, I(mu) = 1 - u(1 - mu). Built once by numerical integration over strips. */
export function buildLimbTable(u = LD_U, m = 800): Float64Array {
  const w = new Float64Array(m)
  for (let j = 0; j < m; j++) {
    const y = -1 + (j + 0.5) * 2 / m, half = Math.sqrt(Math.max(0, 1 - y * y)), k = 200
    let s = 0
    for (let i = 0; i < k; i++) { const x = -half + (i + 0.5) * 2 * half / k; const mu = Math.sqrt(Math.max(0, 1 - x * x - y * y)); s += 1 - u * (1 - mu) }
    w[j] = s * 2 * half / k
  }
  const cum = new Float64Array(m + 1)
  for (let j = 0; j < m; j++) cum[j + 1] = cum[j] + w[j]
  for (let j = 0; j <= m; j++) cum[j] /= cum[m]
  return cum // cum[j] = flux fraction below y = -1 + 2j/m
}
const LIMB = buildLimbTable()
export function limbFraction(d: number): number {
  if (d <= -1) return 0
  if (d >= 1) return 1
  const m = LIMB.length - 1, y = (-d + 1) / 2 * m, j = Math.floor(y), f = y - j
  const below = LIMB[j] + (LIMB[Math.min(m, j + 1)] - LIMB[j]) * f
  return 1 - below
}
export type DiskModel = 'limb' | 'uniform' | 'linear' | 'point'
export function sunFraction(el: number, hz: number, radDeg = 0.2666, model: DiskModel = 'limb'): number {
  const d = (el - hz) / radDeg
  switch (model) {
    case 'point': return d > 0 ? 1 : 0
    case 'linear': return Math.min(1, Math.max(0, (d + 1) / 2))
    case 'uniform': return uniformFraction(d)
    default: return limbFraction(d)
  }
}

// ---------- frames & ephemeris ----------
export function enu(lat: number, lon: number) {
  const la = lat * D2R, lo = lon * D2R
  const U = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]
  const E = [-Math.sin(lo), Math.cos(lo), 0]
  const N = [U[1] * E[2] - U[2] * E[1], U[2] * E[0] - U[0] * E[2], U[0] * E[1] - U[1] * E[0]]
  return { E, N, U }
}
export function siteVector(lat: number, lon: number, rM: number): number[] {
  const la = lat * D2R, lo = lon * D2R, r = rM / 1000
  return [r * Math.cos(la) * Math.cos(lo), r * Math.cos(la) * Math.sin(lo), r * Math.sin(la)]
}
/** Catmull-Rom interpolation of hourly vectors (column offset o: 0 Sun, 3 Earth) at fractional sample index x. */
export function interpVec(e: Ephem, x: number, o: number, out: number[]): number[] {
  const i = Math.min(e.n - 3, Math.max(1, Math.floor(x))), f = x - i
  const f2 = f * f, f3 = f2 * f
  const c0 = -0.5 * f3 + f2 - 0.5 * f, c1 = 1.5 * f3 - 2.5 * f2 + 1, c2 = -1.5 * f3 + 2 * f2 + 0.5 * f, c3 = 0.5 * f3 - 0.5 * f2
  const v = e.v, b = (i - 1) * 6 + o
  for (let k = 0; k < 3; k++) out[k] = c0 * v[b + k] + c1 * v[b + 6 + k] + c2 * v[b + 12 + k] + c3 * v[b + 18 + k]
  return out
}
export function topo(v: number[], obs: number[], f: { E: number[]; N: number[]; U: number[] }) {
  const x = v[0] - obs[0], y = v[1] - obs[1], z = v[2] - obs[2]
  const e = x * f.E[0] + y * f.E[1] + z * f.E[2], n = x * f.N[0] + y * f.N[1] + z * f.N[2], u = x * f.U[0] + y * f.U[1] + z * f.U[2]
  const h = Math.hypot(e, n)
  return { az: ((Math.atan2(e, n) / D2R) + 360) % 360, el: Math.atan2(u, h) / D2R, dist: Math.hypot(h, u) }
}

export interface Series {
  stepH: number; t: number[]
  sunAz: number[]; sunEl: number[]; sunHz: number[]; sunFrac: number[]; sunDistKm: number[]
  earthAz: number[]; earthEl: number[]; earthHz: number[]; earthVis: boolean[]; earthDistKm: number[]
  dsnEl: number[][]; dsnVis: boolean[]
}
export interface SeriesOpts { stepMin?: number; model?: DiskModel; horizon?: number[] }

export function series(d: SiteData, e: Ephem, fromMs: number, toMs: number, o: SeriesOpts = {}): Series {
  const stepMin = o.stepMin ?? 10, model = o.model ?? 'limb', hz = o.horizon ?? d.horizon, step = 360 / hz.length
  const f = enu(d.lat, d.lon), obs = siteVector(d.lat, d.lon, R_MOON_M + d.elevation_m + (d.mast_m ?? 2))
  const dt = stepMin * 60e3, endMs = Math.min(toMs, e.start + (e.n - 3) * e.stepS * 1e3)
  const t0 = Math.max(fromMs, e.start + e.stepS * 1e3)
  const s: Series = { stepH: stepMin / 60, t: [], sunAz: [], sunEl: [], sunHz: [], sunFrac: [], sunDistKm: [], earthAz: [], earthEl: [], earthHz: [], earthVis: [], earthDistKm: [], dsnEl: [[], [], []], dsnVis: [] }
  const sv = [0, 0, 0], ev = [0, 0, 0]
  for (let t = Math.ceil((t0 - e.start) / dt) * dt + e.start; t < endMs; t += dt) {
    const x = (t - e.start) / (e.stepS * 1e3)
    const S = topo(interpVec(e, x, 0, sv), obs, f), Ea = topo(interpVec(e, x, 3, ev), obs, f)
    const sh = horizonAt(hz, step, S.az), eh = horizonAt(hz, step, Ea.az)
    const rad = Math.asin(R_SUN_KM / S.dist) / D2R
    s.t.push(t); s.sunAz.push(S.az); s.sunEl.push(S.el); s.sunHz.push(sh); s.sunFrac.push(sunFraction(S.el, sh, rad, model)); s.sunDistKm.push(S.dist)
    const ev_ = Ea.el > eh
    s.earthAz.push(Ea.az); s.earthEl.push(Ea.el); s.earthHz.push(eh); s.earthVis.push(ev_); s.earthDistKm.push(Ea.dist)
    const i = Math.floor(x), fr = x - i
    let any = false
    for (let k = 0; k < 3; k++) {
      const a = e.dsn[i * 3 + k] / 100, b = e.dsn[Math.min(e.n - 1, i + 1) * 3 + k] / 100, el = a + (b - a) * fr
      s.dsnEl[k].push(el); if (el > DSN_MASK_DEG) any = true
    }
    s.dsnVis.push(ev_ && any)
  }
  return s
}

export interface Window { start: number; end: number }
export function runs(mask: boolean[]): Window[] {
  const out: Window[] = []
  let s = -1
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] && s < 0) s = i
    if (!mask[i] && s >= 0) { out.push({ start: s, end: i }); s = -1 }
  }
  if (s >= 0) out.push({ start: s, end: mask.length })
  return out
}
export interface Metrics {
  hours: number; sunlitPct: number; anySunPct: number; longestDarkH: number; longestDarkStart: number | null
  earthPct: number; dteWindows: { start: number; end: number; hours: number }[]; bothPct: number; powerProxy: number
  dsnPct: number; dsnWindows: { start: number; end: number; hours: number }[]
}
export function metrics(s: Series): Metrics {
  const n = s.t.length, stepH = s.stepH
  const empty = { hours: 0, sunlitPct: 0, anySunPct: 0, longestDarkH: 0, longestDarkStart: null, earthPct: 0, dteWindows: [], bothPct: 0, powerProxy: 0, dsnPct: 0, dsnWindows: [] }
  if (!n) return empty
  let fr = 0, any = 0, e = 0, both = 0, pw = 0, dsn = 0
  for (let i = 0; i < n; i++) {
    fr += s.sunFrac[i]; if (s.sunFrac[i] > 0) any++
    if (s.earthVis[i]) e++
    if (s.dsnVis[i]) dsn++
    if (s.sunFrac[i] >= 0.5 && s.earthVis[i]) both++
    pw += s.sunFrac[i] * Math.cos(Math.max(0, s.sunEl[i]) * D2R) * (AU_KM / s.sunDistKm[i]) ** 2
  }
  let best: Window | null = null
  for (const w of runs(s.sunFrac.map(f => f < 0.5))) if (!best || w.end - w.start > best.end - best.start) best = w
  const win = (m: boolean[]) => runs(m).map(w => ({ start: s.t[w.start], end: s.t[w.end - 1] + stepH * 3600e3, hours: (w.end - w.start) * stepH }))
  return {
    hours: n * stepH, sunlitPct: 100 * fr / n, anySunPct: 100 * any / n,
    longestDarkH: best ? (best.end - best.start) * stepH : 0, longestDarkStart: best ? s.t[best.start] : null,
    earthPct: 100 * e / n, dteWindows: win(s.earthVis), bothPct: 100 * both / n, powerProxy: pw / n,
    dsnPct: 100 * dsn / n, dsnWindows: win(s.dsnVis),
  }
}

// ---------- uncertainty ----------
export interface Range { lo: number; hi: number }
export interface Uncertainty { sunlit: Range; dark: Range; earth: Range; demAvailable: boolean; terms: Record<string, { sunlit: number; dark: number; earth: number }> }
/** Spread of metrics over model choices: time step (10 vs 60 min), Sun-disk model, DEM resolution (40 m vs 240 m horizon). */
export function uncertainty(d: SiteData, e: Ephem, from: number, to: number, ref: Metrics): Uncertainty {
  const variants: Record<string, SeriesOpts> = { step60: { stepMin: 60 }, point: { model: 'point' }, uniform: { model: 'uniform' }, linear: { model: 'linear' } }
  const demAvailable = !!d.horizon_240m && d.dem.includes('40M')
  if (demAvailable) variants.dem240 = { horizon: d.horizon_240m }
  const terms: Uncertainty['terms'] = {}
  for (const [k, o] of Object.entries(variants)) {
    const m = metrics(series(d, e, from, to, { stepMin: 30, ...o }))
    terms[k] = { sunlit: m.sunlitPct - ref.sunlitPct, dark: m.longestDarkH - ref.longestDarkH, earth: m.earthPct - ref.earthPct }
  }
  const rng = (k: 'sunlit' | 'dark' | 'earth', v: number) => {
    const ds = Object.values(terms).map(t => t[k])
    return { lo: v + Math.min(0, ...ds), hi: v + Math.max(0, ...ds) }
  }
  return { sunlit: rng('sunlit', ref.sunlitPct), dark: rng('dark', ref.longestDarkH), earth: rng('earth', ref.earthPct), demAvailable, terms }
}

// ---------- link budget (assumption-labelled) ----------
export interface LinkParams { band: 'X' | 'S'; txPowerW: number; txGainDbi: number; lossesDb: number; dsnDish: 34 | 70; reqEbN0Db: number; marginDb: number }
export const DSN_RX: Record<'X' | 'S', Record<34 | 70, { gainDbi: number; tsysK: number }>> = {
  // Representative DSN receive values (order of magnitude per DSN 810-005 modules 101/103/104); NOT for flight design.
  X: { 34: { gainDbi: 68.2, tsysK: 33 }, 70: { gainDbi: 74.2, tsysK: 22 } },
  S: { 34: { gainDbi: 56.8, tsysK: 40 }, 70: { gainDbi: 63.3, tsysK: 22 } },
}
export const BAND_HZ = { X: 8.42e9, S: 2.29e9 }
export function linkBudget(p: LinkParams, distKm: number) {
  const f = BAND_HZ[p.band], rx = DSN_RX[p.band][p.dsnDish]
  const fspl = 20 * Math.log10(4 * Math.PI * distKm * 1e3 * f / 299792458)
  const eirp = 10 * Math.log10(p.txPowerW) + p.txGainDbi
  const cn0 = eirp - p.lossesDb - fspl + rx.gainDbi + 228.6 - 10 * Math.log10(rx.tsysK)
  const rateDb = cn0 - p.reqEbN0Db - p.marginDb
  return { fsplDb: fspl, eirpDbw: eirp, cn0DbHz: cn0, maxRateBps: 10 ** (rateDb / 10), rx }
}

// ---------- power & battery ----------
export interface PowerParams { loadW: number; panelM2: number; eff: number; batteryDod: number; chargeEff: number }
export const SOLAR_CONST = 1361 // W/m^2 at 1 AU (Kopp & Lean 2011)
/** Vertical, azimuth-tracking panel. Returns energy balance and the battery needed to ride through every deficit in the period. */
export function powerSizing(s: Series, p: PowerParams) {
  let soc = 0, minSoc = 0, gen = 0, worst = 0, cur = 0
  for (let i = 0; i < s.t.length; i++) {
    const pv = SOLAR_CONST * (AU_KM / s.sunDistKm[i]) ** 2 * s.sunFrac[i] * Math.cos(Math.max(0, s.sunEl[i]) * D2R) * p.panelM2 * p.eff
    gen += pv * s.stepH
    const net = pv - p.loadW
    soc += (net > 0 ? net * p.chargeEff : net) * s.stepH
    if (soc > 0) soc = 0 // battery full (track depletion below full)
    minSoc = Math.min(minSoc, soc)
    cur = net < 0 ? cur + s.stepH : 0; worst = Math.max(worst, cur)
  }
  const hours = s.t.length * s.stepH
  return { meanGenW: hours ? gen / hours : 0, deficitWh: -minSoc, batteryWh: -minSoc / p.batteryDod, longestDeficitH: worst, positive: gen >= p.loadW * hours }
}

// ---------- ranking ----------
export type Goal = 'power' | 'comms' | 'psr' | 'balanced'
export const GOALS: Record<Goal, { label: string; w: Record<string, number> }> = {
  power: { label: 'Solar power', w: { sunlit: 0.6, dark: 0.4 } },
  comms: { label: 'Comms (DTE + DSN)', w: { earth: 0.5, dsn: 0.5 } },
  psr: { label: 'PSR / ice access', w: { psrNear: 0.5, psrArea: 0.2, sunlit: 0.3 } },
  balanced: { label: 'Balanced', w: { sunlit: 0.3, dark: 0.2, earth: 0.2, dsn: 0.1, psrNear: 0.2 } },
}
export interface RankInput { id: string; sunlit: number; dark: number; earth: number; dsn: number; psrNear: number | null; psrArea: number | null }
/** Min-max normalise each criterion across sites (higher = better; dark & psr distance inverted), weighted sum 0..100. */
export function rank(rows: RankInput[], goal: Goal) {
  const crit: Record<string, (r: RankInput) => number | null> = {
    sunlit: r => r.sunlit, dark: r => -r.dark, earth: r => r.earth, dsn: r => r.dsn,
    psrNear: r => (r.psrNear == null ? null : -r.psrNear), psrArea: r => r.psrArea,
  }
  const w = GOALS[goal].w
  const scored = rows.map(r => {
    let sc = 0, wsum = 0
    for (const [k, wk] of Object.entries(w)) {
      const vals = rows.map(crit[k]).filter((v): v is number => v != null)
      const v = crit[k](r); if (v == null || !vals.length) continue
      const lo = Math.min(...vals), hi = Math.max(...vals)
      sc += wk * (hi > lo ? (v - lo) / (hi - lo) : 1); wsum += wk
    }
    return { id: r.id, score: wsum ? 100 * sc / wsum : 0 }
  })
  return scored.sort((a, b) => b.score - a.score)
}

// ---------- custom site from shipped horizon grid ----------
export interface Grid { nx: number; ny: number; x0: number; y0: number; step_m: number; bins: number; elev_m: number[]; hz: Int16Array }
export function xyFromLatLon(lat: number, lon: number) {
  const rho = 2 * R_MOON_M * Math.tan(Math.PI / 4 + lat * D2R / 2)
  return { x: rho * Math.sin(lon * D2R), y: rho * Math.cos(lon * D2R) }
}
export function latLonFromXY(x: number, y: number) {
  const rho = Math.hypot(x, y)
  return { lat: (2 * Math.atan(rho / (2 * R_MOON_M)) - Math.PI / 2) / D2R, lon: Math.atan2(x, y) / D2R }
}
/** Bilinear blend of the four surrounding grid horizons and elevations. Returns null outside the grid. */
export function gridSite(g: Grid, x: number, y: number): { horizon: number[]; elevation_m: number } | null {
  const fx = (x - g.x0) / g.step_m, fy = (g.y0 - y) / g.step_m
  if (fx < 0 || fy < 0 || fx > g.nx - 1 || fy > g.ny - 1) return null
  const i = Math.min(g.nx - 2, Math.floor(fx)), j = Math.min(g.ny - 2, Math.floor(fy)), a = fx - i, b = fy - j
  const w = [(1 - a) * (1 - b), a * (1 - b), (1 - a) * b, a * b], idx = [j * g.nx + i, j * g.nx + i + 1, (j + 1) * g.nx + i, (j + 1) * g.nx + i + 1]
  const horizon = new Array(g.bins).fill(0)
  let elevation_m = 0
  for (let k = 0; k < 4; k++) {
    elevation_m += w[k] * g.elev_m[idx[k]]
    for (let q = 0; q < g.bins; q++) horizon[q] += w[k] * g.hz[idx[k] * g.bins + q] / 100
  }
  return { horizon, elevation_m }
}
