import { useMemo, useState } from 'react'
import { GOALS, linkBudget, powerSizing, rank, type Goal, type LinkParams, type Metrics, type PowerParams, type Series, type SiteData } from './physics'
import type { Products } from './data'
import clps from './clps.json'

export const fmtH = (h: number) => (h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(h < 10 ? 1 : 0)} h`)
const fmtRate = (b: number) => b >= 1e6 ? `${(b / 1e6).toFixed(1)} Mbps` : b >= 1e3 ? `${(b / 1e3).toFixed(1)} kbps` : `${b.toFixed(0)} bps`

export function RankView({ rows, products, goal, setGoal }: {
  rows: { d: SiteData; m: Metrics }[]; products: Products; goal: Goal; setGoal: (g: Goal) => void
}) {
  const input = rows.map(({ d, m }) => ({ id: d.id, sunlit: m.sunlitPct, dark: m.longestDarkH, earth: m.earthPct, dsn: m.dsnPct,
    psrNear: products.site_psr[d.id]?.nearest_psr_km ?? null, psrArea: products.site_psr[d.id]?.psr_km2_within_10km ?? null }))
  const r = rank(input, goal), by = Object.fromEntries(rows.map(x => [x.d.id, x]))
  return (
    <section aria-labelledby="rank-h">
      <h2 id="rank-h">Site ranking by mission goal</h2>
      <div role="radiogroup" aria-label="Mission goal" className="seg">
        {(Object.keys(GOALS) as Goal[]).map(g => <button key={g} role="radio" aria-checked={goal === g} className={goal === g ? 'on' : ''} onClick={() => setGoal(g)}>{GOALS[g].label}</button>)}
      </div>
      <p className="small">Weights: {Object.entries(GOALS[goal].w).map(([k, w]) => `${k} ${Math.round(w * 100)}%`).join(', ')}. Each criterion is min–max normalised across the listed sites for the chosen period (30-min step); longest dark and PSR distance are inverted (shorter is better). A screening aid, not a site-selection decision.</p>
      <div className="tablewrap"><table className="rank">
        <thead><tr><th>#</th><th>Site</th><th>Score</th><th>Sunlit %</th><th>Longest dark</th><th>Earth %</th><th>DSN %</th><th>Nearest PSR</th><th>PSR within 10 km</th></tr></thead>
        <tbody>{r.map((x, i) => { const { d, m } = by[x.id]; const p = products.site_psr[d.id]; return (
          <tr key={x.id}><td>{i + 1}</td><td>{d.name}</td><td><div className="bar" style={{ width: `${x.score}%` }} aria-hidden /><span>{x.score.toFixed(0)}</span></td>
            <td>{m.sunlitPct.toFixed(1)}</td><td>{fmtH(m.longestDarkH)}</td><td>{m.earthPct.toFixed(1)}</td><td>{m.dsnPct.toFixed(1)}</td>
            <td>{p?.nearest_psr_km == null ? 'n/a' : `${p.nearest_psr_km} km`}</td><td>{p?.psr_km2_within_10km == null ? 'n/a' : `${p.psr_km2_within_10km} km²`}</td></tr>) })}</tbody>
      </table></div>
    </section>
  )
}

export function PowerComms({ items }: { items: { d: SiteData; s: Series; m: Metrics }[] }) {
  const [sid, setSid] = useState(items[0]?.d.id)
  const it = items.find(i => i.d.id === sid) ?? items[0]
  const [pp, setPp] = useState<PowerParams>({ loadW: 150, panelM2: 3, eff: 0.28, batteryDod: 0.8, chargeEff: 0.95 })
  const [lp, setLp] = useState<LinkParams>({ band: 'X', txPowerW: 10, txGainDbi: 12, lossesDb: 3, dsnDish: 34, reqEbN0Db: 2.5, marginDb: 3 })
  const pw = useMemo(() => it ? powerSizing(it.s, pp) : null, [it, pp])
  const link = useMemo(() => {
    if (!it) return null
    const n = it.s.t.length; let vol = 0, dsum = 0
    for (let i = 0; i < n; i++) { dsum += it.s.earthDistKm[i]; if (it.s.dsnVis[i]) vol += linkBudget(lp, it.s.earthDistKm[i]).maxRateBps * it.s.stepH * 3600 }
    return { mean: linkBudget(lp, dsum / Math.max(1, n)), volGbit: vol / 1e9 }
  }, [it, lp])
  if (!it || !pw || !link) return null
  const num = <K extends string>(o: Record<K, number>, set: (f: (x: Record<K, number>) => Record<K, number>) => void, k: K, label: string, step = 1, min = 0) =>
    <label className="num">{label}<input type="number" step={step} min={min} value={o[k]} onChange={e => { const v = +e.target.value; if (Number.isFinite(v)) set(x => ({ ...x, [k]: v })) }} /></label>
  const stationPct = [0, 1, 2].map(k => 100 * it.s.dsnEl[k].filter((e, i) => e > 10 && it.s.earthVis[i]).length / Math.max(1, it.s.t.length))
  return (
    <section aria-labelledby="pc-h" className="pc">
      <h2 id="pc-h">Power &amp; communications</h2>
      <label>Site <select value={it.d.id} onChange={e => setSid(e.target.value)}>{items.map(i => <option key={i.d.id} value={i.d.id}>{i.d.name}</option>)}</select></label>
      <div className="pc-grid">
        <fieldset><legend>Power &amp; battery sizing</legend>
          {num(pp as unknown as Record<keyof PowerParams, number>, setPp as never, 'loadW', 'Continuous load (W)', 10)}
          {num(pp as unknown as Record<keyof PowerParams, number>, setPp as never, 'panelM2', 'Vertical panel area (m²)', 0.5)}
          {num(pp as unknown as Record<keyof PowerParams, number>, setPp as never, 'eff', 'Cell + MPPT efficiency', 0.01)}
          {num(pp as unknown as Record<keyof PowerParams, number>, setPp as never, 'batteryDod', 'Usable depth of discharge', 0.05)}
          <dl className="metrics">
            <div><dt>Mean generation</dt><dd>{pw.meanGenW.toFixed(0)} W</dd></div>
            <div className={pw.positive ? 'ok' : 'bad'}><dt>Energy balance</dt><dd>{pw.positive ? 'positive' : 'negative'}</dd></div>
            <div><dt>Battery needed</dt><dd>{pw.positive ? `${(pw.batteryWh / 1000).toFixed(1)} kWh` : '∞'}</dd></div>
            <div><dt>Longest deficit</dt><dd>{fmtH(pw.longestDeficitH)}</dd></div>
          </dl>
          <p className="small">Assumes a vertical panel that tracks the Sun in azimuth, 1361 W/m² scaled by Sun distance, visible limb-darkened disk fraction, no thermal or degradation losses, battery starts full. Battery = largest cumulative deficit in the period ÷ DoD. Survival heaters during night are your load value — set it accordingly. Indicative only.</p>
        </fieldset>
        <fieldset><legend>DSN contact &amp; X/S-band link budget</legend>
          <label className="num">Band <select value={lp.band} onChange={e => setLp(x => ({ ...x, band: e.target.value as 'X' | 'S' }))}><option>X</option><option>S</option></select></label>
          <label className="num">DSN antenna <select value={lp.dsnDish} onChange={e => setLp(x => ({ ...x, dsnDish: +e.target.value as 34 | 70 }))}><option value={34}>34 m BWG</option><option value={70}>70 m</option></select></label>
          {num(lp as unknown as Record<string, number>, setLp as never, 'txPowerW', 'Lander RF power (W)', 1)}
          {num(lp as unknown as Record<string, number>, setLp as never, 'txGainDbi', 'Lander antenna gain (dBi)', 1, -10)}
          {num(lp as unknown as Record<string, number>, setLp as never, 'lossesDb', 'Pointing + circuit losses (dB)', 0.5)}
          {num(lp as unknown as Record<string, number>, setLp as never, 'reqEbN0Db', 'Required Eb/N0 (dB)', 0.1)}
          {num(lp as unknown as Record<string, number>, setLp as never, 'marginDb', 'Link margin (dB)', 0.5)}
          <dl className="metrics">
            <div><dt>DSN contact (Earth above terrain & a station ≥10°)</dt><dd>{it.m.dsnPct.toFixed(1)}%</dd></div>
            <div><dt>Free-space loss</dt><dd>{link.mean.fsplDb.toFixed(1)} dB</dd></div>
            <div><dt>C/N0</dt><dd>{link.mean.cn0DbHz.toFixed(1)} dB-Hz</dd></div>
            <div><dt>Max data rate</dt><dd>{fmtRate(link.mean.maxRateBps)}</dd></div>
            <div><dt>Data volume in period</dt><dd>{link.volGbit.toFixed(0)} Gbit</dd></div>
            <div><dt>Contact windows</dt><dd>{it.m.dsnWindows.length}</dd></div>
          </dl>
          <p className="small">Per station (with lunar Earth-visibility): Goldstone {stationPct[0].toFixed(1)}%, Madrid {stationPct[1].toFixed(1)}%, Canberra {stationPct[2].toFixed(1)}%. Receive G/T uses representative values (gain {link.mean.rx.gainDbi} dBi, Tsys {link.mean.rx.tsysK} K) in the spirit of DSN 810-005; atmosphere, elevation-dependent noise, and scheduling (DSN is oversubscribed) are ignored. Not for flight design.</p>
        </fieldset>
      </div>
    </section>
  )
}

export function Missions() {
  return (
    <section aria-labelledby="ms-h">
      <h2 id="ms-h">CLPS mission catalog</h2>
      <p className="small">{clps.note} Compiled {clps.as_of}. Check each source for current status.</p>
      <div className="tablewrap"><table>
        <thead><tr><th>Mission</th><th>Provider</th><th>Launch</th><th>Target</th><th>Status</th><th>Landing (approx.)</th><th>Source</th></tr></thead>
        <tbody>{clps.missions.map(m => <tr key={m.name}><td>{m.name}{m.polar && <span className="tag">south polar</span>}</td><td>{m.provider}</td><td>{m.launch}</td><td>{m.target}</td><td>{m.status}</td>
          <td>{m.lat != null ? `${m.lat}°, ${m.lon}°` : '—'}</td><td className="src">{m.source.split(' ; ').map(s => s.startsWith('http') ? <a key={s} href={s} target="_blank" rel="noreferrer">link</a> : <span key={s}>{s} </span>)}</td></tr>)}</tbody>
      </table></div>
    </section>
  )
}
