import { useEffect, useMemo, useState } from 'react'
import { HorizonWheel } from './HorizonWheel'
import { Timeline } from './Timeline'
import { Methods } from './Methods'
import { metrics, series, type SiteData, type SiteMeta } from './metrics'
import { exportHourlyCsv, exportJson, exportSummaryCsv } from './exportData'

const BASE = import.meta.env.BASE_URL
const DATA_MIN = '2026-01-01', DATA_MAX = '2028-12-31'
const day = (s: string) => Date.parse(s + 'T00:00:00Z')
const fmtUtc = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
const fmtH = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h} h`)

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1))
  return { sites: p.get('sites')?.split(',').filter(Boolean), from: p.get('from'), to: p.get('to'), view: p.get('view') }
}

export default function App() {
  const h0 = readHash()
  const [index, setIndex] = useState<SiteMeta[]>([])
  const [selected, setSelected] = useState<string[]>(h0.sites ?? ['shackleton-rim-high', 'de-gerlache-rim-high', 'malapert-summit'])
  const [from, setFrom] = useState(h0.from ?? '2026-11-14')
  const [to, setTo] = useState(h0.to ?? '2027-02-14')
  const [view, setView] = useState(h0.view === 'methods' ? 'methods' : 'compare')
  const [data, setData] = useState<Record<string, SiteData>>({})
  const [cursorFrac, setCursorFrac] = useState(0.5)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { fetch(BASE + 'data/sites.json').then(r => r.json()).then(j => setIndex(j.sites)).catch(e => setErr(String(e))) }, [])
  useEffect(() => {
    for (const id of selected) if (!data[id])
      fetch(`${BASE}data/sites/${id}.json`).then(r => r.json()).then((d: SiteData) => setData(o => ({ ...o, [id]: d }))).catch(e => setErr(String(e)))
  }, [selected, data])
  useEffect(() => { history.replaceState(null, '', `#sites=${selected.join(',')}&from=${from}&to=${to}&view=${view}`) }, [selected, from, to, view])

  let fromMs = day(from), toMs = day(to) + 86400e3
  if (!(toMs > fromMs)) toMs = fromMs + 86400e3
  const items = useMemo(() => selected.filter(id => data[id]).map(id => {
    const d = data[id], s = series(d, fromMs, toMs)
    return { d, s, m: metrics(s, d.step_hours) }
  }), [selected, data, fromMs, toMs])
  const cursorMs = fromMs + cursorFrac * (toMs - fromMs)

  const toggle = (id: string) => setSelected(s => s.includes(id) ? (s.length > 1 ? s.filter(x => x !== id) : s) : s.length >= 4 ? s : [...s, id])
  const best = (k: 'sunlitPct' | 'earthPct' | 'bothPct' | 'powerProxy', low = false) => {
    if (items.length < 2) return null
    const v = items.map(i => (k === 'powerProxy' ? i.m[k] : i.m[k]))
    return items[v.indexOf(low ? Math.min(...v) : Math.max(...v))].d.id
  }
  const bestDark = items.length > 1 ? items.reduce((a, b) => (b.m.longestDarkH < a.m.longestDarkH ? b : a)).d.id : null

  return (
    <div className="app">
      <header>
        <div className="brand"><span className="logo" aria-hidden>◐</span> <div><h1>Lunar Horizon Wheel</h1>
          <p>Compare Moon south-pole landing sites: when the Sun clears the terrain (power) and when Earth is above it (direct-to-Earth comms).</p></div></div>
        <nav>
          <button className={view === 'compare' ? 'on' : ''} onClick={() => setView('compare')}>Compare</button>
          <button className={view === 'methods' ? 'on' : ''} onClick={() => setView('methods')}>Methods &amp; data</button>
        </nav>
      </header>
      {err && <div className="error">Data load error: {err}</div>}
      {view === 'methods' ? <Methods index={index} /> : (
        <main>
          <section className="controls">
            <fieldset>
              <legend>Sites (pick 2–4)</legend>
              <div className="site-list">
                {index.map(s => (
                  <label key={s.id} className={selected.includes(s.id) ? 'chip on' : 'chip'} title={s.note}>
                    <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)}
                      disabled={!selected.includes(s.id) && selected.length >= 4} />
                    {s.name} <small>{s.lat.toFixed(2)}°, {s.lon.toFixed(2)}°</small>
                  </label>))}
              </div>
            </fieldset>
            <fieldset className="dates">
              <legend>Date range (UTC)</legend>
              <label>From <input type="date" value={from} min={DATA_MIN} max={DATA_MAX} onChange={e => e.target.value && setFrom(e.target.value)} /></label>
              <label>To <input type="date" value={to} min={DATA_MIN} max={DATA_MAX} onChange={e => e.target.value && setTo(e.target.value)} /></label>
              <div className="presets">
                {[['14 d', 14], ['1 lunar day', 29.53], ['90 d', 90], ['1 yr', 365]].map(([l, n]) => (
                  <button key={l as string} onClick={() => setTo(new Date(day(from) + (n as number) * 86400e3).toISOString().slice(0, 10))}>{l}</button>))}
              </div>
            </fieldset>
            <fieldset className="exports">
              <legend>Export</legend>
              <button onClick={() => exportSummaryCsv(items, fromMs, toMs)}>Summary CSV</button>
              <button onClick={() => exportJson(items, fromMs, toMs)}>JSON + DTE windows</button>
              <button onClick={() => exportHourlyCsv(items)}>Hourly CSV</button>
              <button onClick={() => navigator.clipboard?.writeText(location.href)}>Copy share link</button>
            </fieldset>
          </section>

          <section className="scrub">
            <label>Time <input type="range" min={0} max={1000} value={Math.round(cursorFrac * 1000)} onChange={e => setCursorFrac(+e.target.value / 1000)} aria-label="Time scrubber" /></label>
            <span className="now">{fmtUtc(cursorMs)}</span>
          </section>

          <section className="cards" style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(240px, 1fr))` }}>
            {items.map(({ d, s, m }) => {
              const ci = s.t.length ? Math.min(s.t.length - 1, Math.max(0, Math.round((cursorMs - s.t[0]) / (d.step_hours * 3600e3)))) : null
              return (
                <article key={d.id} className="card">
                  <h2>{d.name}</h2>
                  <p className="meta">{d.lat.toFixed(3)}°, {d.lon.toFixed(3)}°E · {Math.round(d.elevation_m)} m · {d.kind === 'derived' ? 'derived candidate' : 'gazetteer feature'}</p>
                  <HorizonWheel horizon={d.horizon} step={d.horizon_step_deg} s={s} cursor={ci} />
                  {ci != null && <p className="instant">☀ {s.sunEl[ci].toFixed(2)}° vs terrain {s.sunHz[ci].toFixed(2)}° → <b>{s.sunFrac[ci] >= 0.5 ? 'lit' : 'shadow'}</b> ({Math.round(s.sunFrac[ci] * 100)}% disk) · 🌍 {s.earthEl[ci].toFixed(2)}° vs {s.earthHz[ci].toFixed(2)}° → <b>{s.earthVis[ci] ? 'in view' : 'blocked'}</b></p>}
                  <dl className="metrics">
                    <div className={best('sunlitPct') === d.id ? 'best' : ''}><dt>Sunlit</dt><dd>{m.sunlitPct.toFixed(1)}%</dd></div>
                    <div className={bestDark === d.id ? 'best' : ''}><dt>Longest dark</dt><dd>{fmtH(m.longestDarkH)}</dd></div>
                    <div className={best('earthPct') === d.id ? 'best' : ''}><dt>Earth in view</dt><dd>{m.earthPct.toFixed(1)}%</dd></div>
                    <div className={best('bothPct') === d.id ? 'best' : ''}><dt>Sun + Earth</dt><dd>{m.bothPct.toFixed(1)}%</dd></div>
                    <div className={best('powerProxy') === d.id ? 'best' : ''}><dt>Power proxy</dt><dd>{(m.powerProxy * 100).toFixed(1)}%</dd></div>
                    <div><dt>DTE windows</dt><dd>{m.dteWindows.length}</dd></div>
                  </dl>
                  <details>
                    <summary>DTE contact windows ({m.dteWindows.length})</summary>
                    <table><thead><tr><th>Start (UTC)</th><th>End (UTC)</th><th>Length</th></tr></thead><tbody>
                      {m.dteWindows.slice(0, 60).map(w => <tr key={w.start}><td>{fmtUtc(w.start).slice(0, 16)}</td><td>{fmtUtc(w.end).slice(0, 16)}</td><td>{fmtH(w.hours)}</td></tr>)}
                    </tbody></table>
                    {m.dteWindows.length > 60 && <p className="small">First 60 shown; export JSON for all.</p>}
                  </details>
                </article>)
            })}
          </section>
          <section className="legend">
            <span><i className="sw sun" /> Sun above terrain</span><span><i className="sw sun-d" /> Sun hidden</span>
            <span><i className="sw earth" /> Earth in view</span><span><i className="sw earth-d" /> Earth hidden</span>
            <span><i className="sw terrain" /> LOLA terrain horizon</span><span>Wheel: radius = elevation (centre = top of scale shown, outer ring = −8°, scale zoomed per site); N up, E right. ★ highlight = best among selected.</span>
          </section>
          <section>
            <h3>Timeline <small>(click to move the time cursor)</small></h3>
            <Timeline rows={items.map(i => ({ name: i.d.name, s: i.s }))} from={fromMs} to={toMs} cursorMs={cursorMs}
              onPick={ms => setCursorFrac(Math.min(1, Math.max(0, (ms - fromMs) / (toMs - fromMs))))} />
          </section>
        </main>)}
      <footer>Real data: NASA LRO LOLA DEMs (PDS) + NAIF SPICE DE440 ephemerides, validated against JPL Horizons. Not an official NASA product. Built for NASA Space Apps 2026.</footer>
    </div>
  )
}
