import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { HorizonWheel } from './HorizonWheel'
import { Timeline } from './Timeline'
import { Methods } from './Methods'
import { MapView } from './MapView'
import { RankView, PowerComms, Missions, fmtH } from './Panels'
import { gridSite, interpVec, metrics, series, uncertainty, xyFromLatLon, type Ephem, type Goal, type Grid, type SiteData, type SiteMeta } from './physics'
import { loadCore, loadGrid, loadLayers, loadSite, type IsroLayer, type Products } from './data'
import { exportJson, exportSeriesCsv, exportSummaryCsv } from './exportData'
const Terrain3D = lazy(() => import('./Terrain3D').then(m => ({ default: m.Terrain3D })))

const DATA_MIN = '2026-01-02', DATA_MAX = '2028-12-30'
const day = (s: string) => Date.parse(s + 'T00:00:00Z')
const fmtUtc = (ms: number) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
const TABS = [['compare', 'Compare'], ['map', 'Map & custom site'], ['3d', '3D terrain'], ['rank', 'Rank'], ['power', 'Power & comms'], ['missions', 'CLPS missions'], ['methods', 'Methods & validation']] as const
type Tab = typeof TABS[number][0]

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1))
  return { sites: p.get('sites')?.split(',').filter(Boolean), from: p.get('from'), to: p.get('to'), view: p.get('view'), custom: p.get('custom') }
}

export default function App() {
  const h0 = useRef(readHash()).current
  const [index, setIndex] = useState<SiteMeta[]>([])
  const [products, setProducts] = useState<Products | null>(null)
  const [ephem, setEphem] = useState<Ephem | null>(null)
  const [grid, setGrid] = useState<Grid | null>(null)
  const [layers, setLayers] = useState<IsroLayer[]>([])
  const [selected, setSelected] = useState<string[]>(h0.sites ?? ['shackleton-rim-high', 'de-gerlache-rim-high', 'malapert-summit'])
  const [from, setFrom] = useState(h0.from ?? '2026-11-14')
  const [to, setTo] = useState(h0.to ?? '2027-02-14')
  const [tab, setTab] = useState<Tab>((TABS.find(t => t[0] === h0.view)?.[0]) ?? 'compare')
  const [data, setData] = useState<Record<string, SiteData>>({})
  const [cursorFrac, setCursorFrac] = useState(0.5)
  const [playing, setPlaying] = useState(false)
  const [goal, setGoal] = useState<Goal>('balanced')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { loadCore().then(c => { setIndex(c.index); setProducts(c.products); setEphem(c.ephem) }).catch(e => setErr(String(e))); loadLayers().then(setLayers) }, [])
  const addCustom = (lat: number, lon: number, g: Grid) => {
    const p = xyFromLatLon(lat, lon), r = gridSite(g, p.x, p.y)
    if (!r) { setErr('Custom point is outside the precomputed horizon grid (±150 km of the pole).'); return }
    const d: SiteData = { id: 'custom', name: `Custom ${lat.toFixed(3)}°, ${lon.toFixed(2)}°`, lat, lon, kind: 'custom', elevation_m: Math.round(r.elevation_m),
      note: 'User-picked point. Horizon blended from the 5 km ray-marched grid (2° bins).', dem: 'grid: LDEM_80S_40M + LDEM_60S_240M (5 km, 2°)', horizon_step_deg: 2, mast_m: 2, horizon: r.horizon }
    setData(o => ({ ...o, custom: d })); setSelected(s => [...s.filter(x => x !== 'custom').slice(0, 3), 'custom'])
  }
  const needGrid = tab === 'map' || !!h0.custom
  useEffect(() => { if (needGrid && products && !grid) loadGrid(products).then(g => { setGrid(g); if (h0.custom) { const [a, b] = h0.custom.split(',').map(Number); if (isFinite(a) && isFinite(b)) addCustom(a, b, g) } }).catch(e => setErr(String(e))) }, [needGrid, products, grid]) // eslint-disable-line react-hooks/exhaustive-deps
  const wantIds = tab === 'rank' ? [...new Set([...index.map(s => s.id), ...selected])] : selected
  useEffect(() => {
    for (const id of wantIds) if (!data[id] && id !== 'custom')
      loadSite(id).then(d => setData(o => ({ ...o, [id]: d }))).catch(e => setErr(String(e)))
  }, [wantIds.join(','), data]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = data.custom && selected.includes('custom') ? `&custom=${data.custom.lat.toFixed(4)},${data.custom.lon.toFixed(3)}` : ''
    history.replaceState(null, '', `#sites=${selected.join(',')}&from=${from}&to=${to}&view=${tab}${c}`)
  }, [selected, from, to, tab, data.custom])

  let fromMs = day(from), toMs = day(to) + 86400e3
  if (!(toMs > fromMs)) toMs = fromMs + 86400e3
  const items = useMemo(() => !ephem ? [] : selected.filter(id => data[id]).map(id => {
    const d = data[id], s = series(d, ephem, fromMs, toMs), m = metrics(s)
    return { d, s, m, u: uncertainty(d, ephem, fromMs, toMs, m) }
  }), [selected, data, fromMs, toMs, ephem])
  const rankRows = useMemo(() => tab !== 'rank' || !ephem ? [] : wantIds.filter(id => data[id]).map(id => ({ d: data[id], m: metrics(series(data[id], ephem, fromMs, toMs, { stepMin: 30 })) })),
    [tab, data, fromMs, toMs, ephem, wantIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const cursorMs = fromMs + cursorFrac * (toMs - fromMs)
  const sunVec = useMemo(() => ephem ? interpVec(ephem, (cursorMs - ephem.start) / (ephem.stepS * 1e3), 0, [0, 0, 0]) : null, [ephem, cursorMs])

  useEffect(() => {
    if (!playing) return
    let raf = 0, last = performance.now()
    const tick = (t: number) => { const dt = t - last; last = t; setCursorFrac(f => (f + dt / 20000) % 1); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf)
  }, [playing])
  useEffect(() => { if (matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(false) }, [])

  const toggle = (id: string) => setSelected(s => s.includes(id) ? (s.length > 1 ? s.filter(x => x !== id) : s) : s.length >= 4 ? s : [...s, id])
  const bestOf = (f: (m: typeof items[number]['m']) => number, low = false) => {
    if (items.length < 2) return null
    const v = items.map(i => f(i.m)); return items[v.indexOf(low ? Math.min(...v) : Math.max(...v))].d.id
  }
  const tabKey = (e: React.KeyboardEvent, i: number) => {
    const n = TABS.length, j = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i + n - 1) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (j >= 0) { e.preventDefault(); setTab(TABS[j][0]); document.getElementById('tab-' + TABS[j][0])?.focus() }
  }
  const doPdf = async () => {
    setBusy(true)
    try {
      const { pdfReport, svgToPng } = await import('./report')
      const svgs = [...document.querySelectorAll<SVGSVGElement>('svg.wheel')]
      const wheels = await Promise.all(svgs.map(s => svgToPng(s).catch(() => '')))
      pdfReport(items, fromMs, toMs, wheels)
    } catch (e) { setErr('PDF export failed: ' + e) } finally { setBusy(false) }
  }
  const range = (lo: number, hi: number, f = (x: number) => x.toFixed(1)) => <span className="rng" title="Uncertainty envelope: time step, Sun-disk model, DEM resolution">{f(lo)}–{f(hi)}</span>

  return (
    <div className="app">
      <a href="#main" className="skip">Skip to content</a>
      <header>
        <div className="brand"><svg className="logo" viewBox="0 0 40 40" aria-hidden><circle cx="20" cy="20" r="17" fill="#1b2235" stroke="#ffc23d" strokeWidth="2" /><path d="M3 24 L10 19 L15 22 L22 15 L28 20 L37 17 L37 24 A17 17 0 0 1 3 24Z" fill="#7a6248" /><circle cx="29" cy="11" r="3.5" fill="#ffc23d" /><circle cx="11" cy="12" r="2.5" fill="#4fa3ff" /></svg>
          <div><h1>Lunar Horizon Wheel</h1>
            <p>Research-grade comparison of Moon south-pole sites: when the Sun clears the terrain (power), when Earth and the Deep Space Network can be reached (comms) — validated against NASA Goddard maps.</p></div></div>
      </header>
      <nav role="tablist" aria-label="Views" className="tabs">
        {TABS.map(([k, l], i) => <button key={k} id={'tab-' + k} role="tab" aria-selected={tab === k} aria-controls="main" tabIndex={tab === k ? 0 : -1} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} onKeyDown={e => tabKey(e, i)}>{l}</button>)}
      </nav>
      {err && <div className="error" role="alert">{err} <button onClick={() => setErr(null)} aria-label="Dismiss error">×</button></div>}
      <main id="main" role="tabpanel" aria-labelledby={'tab-' + tab}>
        {tab !== 'methods' && tab !== 'missions' && (
          <section className="controls">
            <fieldset>
              <legend>Sites (pick 1–4)</legend>
              <div className="site-list">
                {[...index, ...(data.custom ? [data.custom] : [])].map(s => (
                  <label key={s.id} className={selected.includes(s.id) ? 'chip on' : 'chip'} title={s.note}>
                    <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} disabled={!selected.includes(s.id) && selected.length >= 4} />
                    {s.name} {s.kind === 'derived' && <em className="tag">illustrative</em>}{s.kind === 'isro' && <em className="tag isro">ISRO</em>}{s.kind === 'custom' && <em className="tag">custom</em>}
                  </label>))}
              </div>
            </fieldset>
            <fieldset className="dates">
              <legend>Date range (UTC, 2026–2028)</legend>
              <label>From <input type="date" value={from} min={DATA_MIN} max={DATA_MAX} onChange={e => e.target.value && setFrom(e.target.value)} /></label>
              <label>To <input type="date" value={to} min={DATA_MIN} max={DATA_MAX} onChange={e => e.target.value && setTo(e.target.value)} /></label>
              <div className="presets">
                {([['14 d', 14], ['1 lunar day', 29.53], ['90 d', 90], ['1 yr', 365]] as const).map(([l, n]) => (
                  <button key={l} onClick={() => setTo(new Date(Math.min(day(DATA_MAX), day(from) + n * 86400e3)).toISOString().slice(0, 10))}>{l}</button>))}
              </div>
            </fieldset>
            <fieldset className="exports">
              <legend>Export</legend>
              <button onClick={doPdf} disabled={busy || !items.length}>{busy ? 'Building…' : 'PDF report'}</button>
              <button onClick={() => exportSummaryCsv(items, fromMs, toMs)}>Summary CSV</button>
              <button onClick={() => exportJson(items, fromMs, toMs)}>JSON + windows</button>
              <button onClick={() => exportSeriesCsv(items)}>10-min CSV</button>
              <button onClick={() => navigator.clipboard?.writeText(location.href)}>Copy share link</button>
            </fieldset>
          </section>)}
        {(tab === 'compare' || tab === '3d') && (
          <section className="scrub" aria-label="Time cursor">
            <button className="play" onClick={() => setPlaying(p => !p)} aria-pressed={playing} aria-label={playing ? 'Pause animation' : 'Animate Sun and Earth tracks'}>{playing ? '❚❚' : '▶'}</button>
            <input type="range" min={0} max={1000} value={Math.round(cursorFrac * 1000)} onChange={e => setCursorFrac(+e.target.value / 1000)} aria-label="Time cursor" aria-valuetext={fmtUtc(cursorMs)} />
            <span className="now" aria-live="off">{fmtUtc(cursorMs)}</span>
          </section>)}
        {!ephem && !err && <p className="small">Loading ephemeris and site data…</p>}

        {tab === 'compare' && <>
          <section className="cards">
            {items.map(({ d, s, m, u }) => {
              const ci = s.t.length ? Math.min(s.t.length - 1, Math.max(0, Math.round((cursorMs - s.t[0]) / (s.stepH * 3600e3)))) : null
              return (
                <article key={d.id} className="card" aria-label={d.name}>
                  <h2>{d.name}</h2>
                  <p className="meta">{d.lat.toFixed(3)}°, {d.lon.toFixed(3)}°E · {Math.round(d.elevation_m)} m · {d.dem}{d.kind === 'derived' && ' · illustrative candidate'}</p>
                  <HorizonWheel horizon={d.horizon} alt={u.demAvailable ? d.horizon_240m : undefined} step={d.horizon_step_deg} s={s} cursor={ci} label={`Horizon wheel for ${d.name}`} />
                  {ci != null && <p className="instant" aria-live="polite">☀ {s.sunEl[ci].toFixed(2)}° vs terrain {s.sunHz[ci].toFixed(2)}° → <b>{Math.round(s.sunFrac[ci] * 100)}% of disk</b> · 🌍 {s.earthEl[ci].toFixed(2)}° vs {s.earthHz[ci].toFixed(2)}° → <b>{s.earthVis[ci] ? 'in view' : 'blocked'}</b>{s.dsnVis[ci] && ' · DSN ✓'}</p>}
                  <dl className="metrics">
                    <div className={bestOf(x => x.sunlitPct) === d.id ? 'best' : ''}><dt>Sunlit</dt><dd>{m.sunlitPct.toFixed(1)}%</dd>{range(u.sunlit.lo, u.sunlit.hi)}</div>
                    <div className={bestOf(x => x.longestDarkH, true) === d.id ? 'best' : ''}><dt>Longest dark</dt><dd>{fmtH(m.longestDarkH)}</dd>{range(u.dark.lo, u.dark.hi, x => fmtH(Math.max(0, x)))}</div>
                    <div className={bestOf(x => x.earthPct) === d.id ? 'best' : ''}><dt>Earth in view</dt><dd>{m.earthPct.toFixed(1)}%</dd>{range(u.earth.lo, u.earth.hi)}</div>
                    <div className={bestOf(x => x.dsnPct) === d.id ? 'best' : ''}><dt>DSN contact</dt><dd>{m.dsnPct.toFixed(1)}%</dd></div>
                    <div className={bestOf(x => x.bothPct) === d.id ? 'best' : ''}><dt>Sun + Earth</dt><dd>{m.bothPct.toFixed(1)}%</dd></div>
                    <div className={bestOf(x => x.powerProxy) === d.id ? 'best' : ''}><dt>Power index <abbr title="Mean visible-disk fraction × cos(elevation) × (1 AU / distance)²; 100% = full Sun at 1 AU on a vertical tracking panel">ⓘ</abbr></dt><dd>{(m.powerProxy * 100).toFixed(1)}%</dd></div>
                  </dl>
                  {!u.demAvailable && <p className="small warn">DEM-resolution uncertainty unavailable (no 40 m DEM here); ranges cover time step and disk model only.</p>}
                  <details>
                    <summary>DSN contact windows ({m.dsnWindows.length}) · DTE windows ({m.dteWindows.length})</summary>
                    <table><thead><tr><th>DSN start (UTC)</th><th>End</th><th>Length</th></tr></thead><tbody>
                      {m.dsnWindows.slice(0, 40).map(w => <tr key={w.start}><td>{fmtUtc(w.start).slice(0, 16)}</td><td>{fmtUtc(w.end).slice(0, 16)}</td><td>{fmtH(w.hours)}</td></tr>)}
                    </tbody></table>
                    {m.dsnWindows.length > 40 && <p className="small">First 40 shown; export JSON for all.</p>}
                  </details>
                </article>)
            })}
          </section>
          <section className="legend" aria-label="Legend">
            <span><i className="sw sun" /> Sun above terrain</span><span><i className="sw sun-d" /> Sun hidden</span>
            <span><i className="sw earth" /> Earth in view</span><span><i className="sw earth-d" /> Earth hidden</span>
            <span><i className="sw terrain" /> LOLA horizon (40 m)</span><span><i className="sw alt" /> 240 m-DEM horizon</span>
            <span>Wheel: radius = elevation, N up, E right. Grey ranges = uncertainty envelope. ★ = best among selected.</span>
          </section>
          <section>
            <h3>Timeline <small>(10-min resolution; click to move the cursor)</small></h3>
            <Timeline rows={items.map(i => ({ name: i.d.name, s: i.s }))} from={fromMs} to={toMs} cursorMs={cursorMs}
              onPick={ms => setCursorFrac(Math.min(1, Math.max(0, (ms - fromMs) / (toMs - fromMs))))} />
          </section>
        </>}
        {tab === 'map' && products && <MapView products={products} index={index} selected={selected} layers={layers}
          onToggle={toggle} onPick={(lat, lon) => { if (grid) { addCustom(lat, lon, grid); setTab('compare') } }} />}
        {tab === '3d' && products && <Suspense fallback={<p>Loading 3D…</p>}><Terrain3D products={products} index={index} selected={selected} sunVec={sunVec} /></Suspense>}
        {tab === 'rank' && products && <RankView rows={rankRows} products={products} goal={goal} setGoal={setGoal} />}
        {tab === 'power' && <PowerComms items={items} />}
        {tab === 'missions' && <Missions />}
        {tab === 'methods' && <Methods index={index} layers={layers} />}
        {layers.length > 0 && tab === 'map' && <section className="layers"><h3>Chandrayaan-3 layers (ISRO)</h3>{layers.map(l => <LayerCard key={l.id} l={l} />)}<p className="small">ISRO data terms: Chandrayaan data are provided by ISRO/ISSDC for non-commercial research and education with acknowledgement "ISRO/ISSDC"; raw data are not redistributed here (derived previews only).</p></section>}
      </main>
      <footer>Real data: NASA LRO LOLA (PDS), NASA GSFC PGDA illumination maps, NASA JPL NAIF SPICE (DE440){layers.length ? ', ISRO Chandrayaan-3 results (see Methods for attribution)' : ''}. Built with AI assistance (see Methods §7). Not an official NASA or ISRO product. NASA Space Apps 2026.</footer>
    </div>
  )
}

function LayerCard({ l }: { l: IsroLayer }) {
  const f0 = l.features[0]?.properties ?? {}
  const isTemps = l.features.length > 5
  const temps = isTemps ? l.features.map(f => Number(f.properties.absolute_T_K)).filter(Number.isFinite) : []
  return (
    <article className="card layer">
      <h4>{l.title}</h4>
      {l.image && <figure><img src={l.image} alt={l.title} className="figure dark" />{l.caption && <figcaption className="small">{l.caption}</figcaption>}</figure>}
      {l.series && <ChasteChart s={l.series} />}
      {l.caption && !l.image && <p className="small warn">{l.caption}</p>}
      {l.image || l.series ? null : isTemps ? <p>{l.features.length} points within ~350 m of ChaSTE; absolute temperature {Math.min(...temps).toFixed(0)}–{Math.max(...temps).toFixed(0)} K (local times as given in source).</p> : (
        <dl className="kv">{['name', 'landed_utc', 'chaste_peak_surface_T_K', 'chaste_flat_surface_T_K', 'diviner_predicted_T_K', 'apxs_n_obs'].filter(k => f0[k] != null).map(k => <div key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd>{String(f0[k])}</dd></div>)}
          {f0.apxs_mean_wt_pct != null && <div><dt>APXS mean wt%</dt><dd>{Object.entries(f0.apxs_mean_wt_pct as Record<string, number>).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}</dd></div>}</dl>)}
      <p className="small">{l.attribution} — {l.licence}</p>
    </article>
  )
}

function ChasteChart({ s }: { s: { utc: string[]; values: number[][]; sensors: string[] } }) {
  const k = s.sensors.indexOf('S2'), W = 600, H = 180, P = 34
  const t = s.utc.map(u => Date.parse(u.replace('Z', ':00Z'))), v = s.values.map(r => r[k])
  const t0 = Math.min(...t), t1 = Math.max(...t), lo = Math.floor(Math.min(...v) / 10) * 10, hi = Math.ceil(Math.max(...v) / 10) * 10
  const X = (x: number) => P + (x - t0) / (t1 - t0) * (W - P - 8), Y = (y: number) => H - 20 - (y - lo) / (hi - lo) * (H - 30)
  const peak = Math.max(...v)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`ChaSTE S2 near-surface temperature, archive values, peak ${peak.toFixed(1)} K`} className="chaste">
      <rect x={P} y={10} width={W - P - 8} height={H - 30} fill="#0f131c" />
      {[lo, (lo + hi) / 2, hi].map(y => <g key={y}><line x1={P} x2={W - 8} y1={Y(y)} y2={Y(y)} stroke="#26304a" /><text x={P - 4} y={Y(y) + 4} fill="#a3abbf" fontSize="10" textAnchor="end">{y.toFixed(0)} K</text></g>)}
      <path d={'M' + t.map((x, i) => `${X(x).toFixed(1)},${Y(v[i]).toFixed(1)}`).join('L')} fill="none" stroke="#ff9933" strokeWidth="1.5" />
      <text x={P} y={H - 4} fill="#a3abbf" fontSize="10">{new Date(t0).toISOString().slice(0, 10)}</text>
      <text x={W - 8} y={H - 4} fill="#a3abbf" fontSize="10" textAnchor="end">{new Date(t1).toISOString().slice(0, 10)} UTC · S2 (near-surface), peak {peak.toFixed(1)} K (archive)</text>
    </svg>)
}
