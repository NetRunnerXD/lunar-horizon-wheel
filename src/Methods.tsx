import { useEffect, useState } from 'react'
import { BASE, loadJson, type IsroLayer } from './data'
import type { SiteMeta } from './physics'

const REPO = 'https://github.com/NetRunnerXD/lunar-horizon-wheel/blob/main/'
type St = { n: number; bias: number; rmse: number; mae: number; p95_abs: number; r: number }
interface Val { period: string; grid: Record<string, St>; sites: Record<string, St>; interpolation: Record<string, number>; raymarch_vs_exhaustive: { id: string; rms_deg: number }[] }
interface Unc { reference: string; period: string; sites: { id: string; name: string; reference: Record<string, number>; variants: Record<string, Record<string, number>> }[] }

export function Methods({ index, layers }: { index: SiteMeta[]; layers: IsroLayer[] }) {
  const [v, setV] = useState<Val | null>(null), [u, setU] = useState<Unc | null>(null)
  useEffect(() => { loadJson<Val>('data/validation_pgda.json').then(setV).catch(() => {}); loadJson<Unc>('data/uncertainty.json').then(setU).catch(() => {}) }, [])
  const row = (name: string, s?: St) => s && <tr key={name}><td>{name}</td><td>{s.n}</td><td>{(s.bias * 100).toFixed(2)}</td><td>{(s.rmse * 100).toFixed(2)}</td><td>{(s.mae * 100).toFixed(2)}</td><td>{s.r.toFixed(3)}</td></tr>
  return (
    <article className="methods">
      <h2>Methods, validation &amp; data</h2>
      <p>Full paper-style write-up: <a href={REPO + 'METHODS.md'}>METHODS.md</a> · generated validation report: <a href={REPO + 'docs/validation.md'}>docs/validation.md</a> · pipeline: <code>make all</code> (or <code>pipeline/run_all.sh</code>).</p>
      <h3>1. Model in one paragraph</h3>
      <p>For each site we compute the local terrain horizon (max elevation angle in 720 azimuth bins) by scanning every LOLA DEM pixel out to 400 km (40 m DEM to 25 km, 240 m beyond; Moon curvature included, 2 m mast). Sun and Earth positions come from NAIF SPICE (DE440, MOON_ME frame, light time + stellar aberration), shipped hourly and interpolated in the browser to a <b>10-minute step</b> (Catmull-Rom; error ≤ {v ? v.interpolation.sun_max_deg.toExponential(1) : '…'}°). Sunlight is the visible fraction of a <b>finite, limb-darkened solar disk</b> (linear law, u = 0.56) cut by the horizon; Earth is "in view" when its centre clears the terrain. DSN contact additionally requires the Moon ≥ 10° above the horizon at Goldstone, Madrid or Canberra.</p>
      <h3>2. Cross-validation against NASA Goddard (PGDA/LOLA) maps</h3>
      {v ? <>
        <p>We recomputed 18.6-year averages ({v.period}) on a 5 km grid (3,721 nodes) and at the sites, and compared them with the LOLA team's average-visibility maps (Mazarico et al. 2011, 2016 release). Differences are ours − PGDA in percentage points of time.</p>
        <div className="tablewrap"><table className="val"><thead><tr><th>Comparison</th><th>N</th><th>Bias (pp)</th><th>RMSE (pp)</th><th>MAE (pp)</th><th>r</th></tr></thead><tbody>
          {row('Grid: Sun (any part of disk)', v.grid.sun_any_vs_pgda)}{row('Grid: Earth (any part of disk)', v.grid.earth_any_vs_pgda)}
          {row('Sites: Sun vs PGDA 240 m pixel', v.sites.sun_any_vs_pgda240)}{row('Sites: Sun vs PGDA 60 m, best pixel within 150 m', v.sites.sun_any_vs_pgda60_nbhd_max)}{row('Sites: Earth vs PGDA 240 m', v.sites.earth_any_vs_pgda240)}
        </tbody></table></div>
        <img src={`${BASE}data/validation_scatter.png`} alt="Scatter plots of our 18.6-year average Sun and Earth visibility versus the PGDA maps; points cluster on the 1:1 line" className="figure" />
        <p className="small">Area-wide agreement is good (r ≈ 0.96, bias &lt; 1 pp). Single-pixel crest sites disagree with the nearest PGDA pixel because illumination changes by tens of points over 100 m on a rim; against the best PGDA pixel within 150 m they agree to a few points. Remaining differences come from DEM versions (LDEM_80S_40M vs the 2016 maps' inputs), the 2° grid horizons and the averaging epoch.</p>
      </> : <p>Loading validation…</p>}
      <h3>3. Uncertainty</h3>
      <p>Error bars in the Compare view are the envelope of re-running the selected period with a 60-min step, point / uniform / linear Sun-disk models, and the 240 m-only horizon (DEM resolution). Pipeline sensitivity for calendar 2027 ({u?.reference}):</p>
      {u && <div className="tablewrap"><table className="val"><thead><tr><th>Site</th><th>Sunlit %</th><th>Δ 60-min</th><th>Δ point Sun</th><th>Δ uniform disk</th><th>Δ 240 m DEM</th><th>Earth %</th><th>Δ Earth 240 m</th></tr></thead><tbody>
        {u.sites.map(s => <tr key={s.id}><td>{s.name}</td><td>{Math.abs(s.reference.sunlit).toFixed(2)}</td>
          {['step_60min', 'disk_point', 'disk_uniform', 'dem_240m'].map(k => <td key={k}>{(s.variants[k].sunlit - s.reference.sunlit).toFixed(2)}</td>)}
          <td>{s.reference.earth.toFixed(1)}</td><td>{(s.variants.dem_240m.earth - s.reference.earth).toFixed(2)}</td></tr>)}
      </tbody></table></div>}
      <p className="small">Time step and disk model move results by ≤ 0.2 pp; DEM resolution dominates (up to tens of points on steep slopes), so treat near-field terrain as the main uncertainty.</p>
      <h3>4. Data sources &amp; licences</h3>
      <ul>
        <li>LRO LOLA LDEM_80S_40M and LDEM_60S_240M (NASA PDS Geosciences Node; public domain, NASA).</li>
        <li>LOLA/PGDA average Sun and Earth visibility and PSR maps, 2016 release (NASA GSFC PGDA product 69; public domain).</li>
        <li>NAIF SPICE kernels: DE440s, moon_pa_de440, moon_de440 FK, pck00011, naif0012 (NASA JPL NAIF; public).</li>
        <li>DSN station locations: approximate, DSN 810-005. CLPS catalog: NASA / provider pages (see table).</li>
        {layers.map(l => <li key={l.id}><b>{l.title}</b>: {l.attribution} <i>{l.licence}</i></li>)}
      </ul>
      <h3>5. Sites</h3>
      <div className="tablewrap"><table><thead><tr><th>Site</th><th>Lat</th><th>Lon</th><th>Elev. (m)</th><th>DEM</th><th>Note</th></tr></thead>
        <tbody>{index.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.lat}</td><td>{s.lon}</td><td>{s.elevation_m}</td><td>{s.dem}</td><td>{s.note}</td></tr>)}</tbody></table></div>
      <h3>6. Limitations</h3>
      <ul>
        <li>Illumination is geometric: no scattered light, no Earthshine, no regolith thermal model.</li>
        <li>Horizons are binned at 0.5° (sites) or 2° (custom grid, 5 km spacing); small near-field features under the DEM resolution are missed.</li>
        <li>Link budget and power sizing use labelled representative assumptions and are not flight-design tools.</li>
        <li>"Derived" sites are DEM-maximum pixels near named features, not official landing sites. The Shiv Shakti point uses only the 240 m DEM.</li>
        <li>Chandrayaan-2 OHRC/TMC-2/DFSAR rasters are not included (ISSDC PRADAN login required).</li>
      </ul>
      <h3>7. AI-use disclosure</h3>
      <p>This project was designed and coded with substantial help from AI assistants (code generation, documentation drafting, data-source research), directed and reviewed by the team. All numbers come from the real datasets above via the reproducible pipeline; nothing is AI-generated data.</p>
    </article>
  )
}
