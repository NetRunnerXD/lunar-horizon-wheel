import type { Metrics, Series, SiteData } from './metrics'

function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16) + 'Z'

export function summaryCsv(items: { d: SiteData; m: Metrics }[], from: number, to: number) {
  const head = 'site_id,site_name,lat,lon,elevation_m,from_utc,to_utc,hours,sunlit_pct,any_sun_pct,longest_dark_h,longest_dark_start_utc,earth_visible_pct,dte_windows,sun_and_earth_pct,power_proxy'
  const rows = items.map(({ d, m }) => [d.id, `"${d.name}"`, d.lat, d.lon, d.elevation_m, iso(from), iso(to), m.hours, m.sunlitPct.toFixed(2), m.anySunPct.toFixed(2),
    m.longestDarkH, m.longestDarkStart ? iso(m.longestDarkStart) : '', m.earthPct.toFixed(2), m.dteWindows.length, m.bothPct.toFixed(2), m.powerProxy.toFixed(4)].join(','))
  return [head, ...rows].join('\n')
}
export function exportSummaryCsv(items: { d: SiteData; m: Metrics }[], from: number, to: number) {
  download('lunar-horizon-wheel-summary.csv', summaryCsv(items, from, to), 'text/csv')
}
export function exportJson(items: { d: SiteData; m: Metrics }[], from: number, to: number) {
  const out = { generated_by: 'Lunar Horizon Wheel', from_utc: iso(from), to_utc: iso(to),
    sites: items.map(({ d, m }) => ({ id: d.id, name: d.name, lat: d.lat, lon: d.lon, elevation_m: d.elevation_m, metrics: { ...m,
      longestDarkStart: m.longestDarkStart ? iso(m.longestDarkStart) : null,
      dteWindows: m.dteWindows.map(w => ({ start_utc: iso(w.start), end_utc: iso(w.end), hours: w.hours })) } })) }
  download('lunar-horizon-wheel.json', JSON.stringify(out, null, 1), 'application/json')
}
export function exportHourlyCsv(items: { d: SiteData; s: Series }[]) {
  const lines = ['site_id,utc,sun_az,sun_el,sun_horizon_el,sun_disk_fraction,earth_az,earth_el,earth_horizon_el,earth_visible']
  for (const { d, s } of items) for (let i = 0; i < s.t.length; i++)
    lines.push([d.id, iso(s.t[i]), s.sunAz[i], s.sunEl[i], s.sunHz[i].toFixed(2), s.sunFrac[i].toFixed(3), s.earthAz[i], s.earthEl[i], s.earthHz[i].toFixed(2), s.earthVis[i] ? 1 : 0].join(','))
  download('lunar-horizon-wheel-hourly.csv', lines.join('\n'), 'text/csv')
}
