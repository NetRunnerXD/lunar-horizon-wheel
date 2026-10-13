// Pure visibility/metric functions. All angles in degrees.
export interface SiteMeta {
  id: string; name: string; lat: number; lon: number; kind: string; note: string
  elevation_m: number; dem: string
}
export interface SiteData extends SiteMeta {
  start: string; step_hours: number; n: number; horizon_step_deg: number
  horizon: number[]; sun_az: number[]; sun_el: number[]; earth_az: number[]; earth_el: number[]
}
export const SUN_RADIUS_DEG = 0.2666

export function horizonAt(h: number[], step: number, az: number): number {
  const n = h.length
  const x = (((az % 360) + 360) % 360) / step - 0.5 // bins are centred on (i+0.5)*step
  const i0 = Math.floor(x)
  const f = x - i0
  const a = h[((i0 % n) + n) % n], b = h[(((i0 + 1) % n) + n) % n]
  return a + (b - a) * f
}

/** Approximate visible fraction of the solar disk (linear in disk-height, 0..1). */
export function sunFraction(el: number, hz: number): number {
  const v = (el - hz + SUN_RADIUS_DEG) / (2 * SUN_RADIUS_DEG)
  return v <= 0 ? 0 : v >= 1 ? 1 : v
}

export interface Window { start: number; end: number } // sample indices, end exclusive

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

export interface Series {
  t: number[] // ms epoch
  sunAz: number[]; sunEl: number[]; earthAz: number[]; earthEl: number[]
  sunHz: number[]; earthHz: number[]; sunFrac: number[]; earthVis: boolean[]
}

export function indexRange(d: SiteData, fromMs: number, toMs: number): [number, number] {
  const t0 = Date.parse(d.start), dt = d.step_hours * 3600e3
  const a = Math.max(0, Math.ceil((fromMs - t0) / dt))
  const b = Math.min(d.n, Math.floor((toMs - t0) / dt))
  return [a, Math.max(a, b)]
}

export function series(d: SiteData, fromMs: number, toMs: number): Series {
  const [a, b] = indexRange(d, fromMs, toMs)
  const t0 = Date.parse(d.start), dt = d.step_hours * 3600e3
  const s: Series = { t: [], sunAz: [], sunEl: [], earthAz: [], earthEl: [], sunHz: [], earthHz: [], sunFrac: [], earthVis: [] }
  for (let i = a; i < b; i++) {
    const sa = d.sun_az[i] / 100, se = d.sun_el[i] / 100, ea = d.earth_az[i] / 100, ee = d.earth_el[i] / 100
    const sh = horizonAt(d.horizon, d.horizon_step_deg, sa), eh = horizonAt(d.horizon, d.horizon_step_deg, ea)
    s.t.push(t0 + i * dt); s.sunAz.push(sa); s.sunEl.push(se); s.earthAz.push(ea); s.earthEl.push(ee)
    s.sunHz.push(sh); s.earthHz.push(eh); s.sunFrac.push(sunFraction(se, sh)); s.earthVis.push(ee > eh)
  }
  return s
}

export interface Metrics {
  hours: number
  sunlitPct: number          // time-weighted visible solar disk fraction
  anySunPct: number          // any part of the disk visible
  longestDarkH: number       // longest stretch with sun centre below terrain (disk < 50%)
  longestDarkStart: number | null
  earthPct: number
  dteWindows: { start: number; end: number; hours: number }[]
  bothPct: number            // sun centre up AND Earth visible
  powerProxy: number         // mean of frac*cos(el): vertical, sun-tracking panel, 0..1
}

export function metrics(s: Series, stepH: number): Metrics {
  const n = s.t.length
  if (!n) return { hours: 0, sunlitPct: 0, anySunPct: 0, longestDarkH: 0, longestDarkStart: null, earthPct: 0, dteWindows: [], bothPct: 0, powerProxy: 0 }
  let fr = 0, any = 0, e = 0, both = 0, pw = 0
  for (let i = 0; i < n; i++) {
    fr += s.sunFrac[i]; if (s.sunFrac[i] > 0) any++
    if (s.earthVis[i]) e++
    if (s.sunFrac[i] >= 0.5 && s.earthVis[i]) both++
    pw += s.sunFrac[i] * Math.cos((Math.max(0, s.sunEl[i]) * Math.PI) / 180)
  }
  const dark = runs(s.sunFrac.map(f => f < 0.5))
  let best: Window | null = null
  for (const w of dark) if (!best || w.end - w.start > best.end - best.start) best = w
  const dte = runs(s.earthVis).map(w => ({ start: s.t[w.start], end: s.t[w.end - 1] + stepH * 3600e3, hours: (w.end - w.start) * stepH }))
  return {
    hours: n * stepH, sunlitPct: (100 * fr) / n, anySunPct: (100 * any) / n,
    longestDarkH: best ? (best.end - best.start) * stepH : 0, longestDarkStart: best ? s.t[best.start] : null,
    earthPct: (100 * e) / n, dteWindows: dte, bothPct: (100 * both) / n, powerProxy: pw / n,
  }
}
