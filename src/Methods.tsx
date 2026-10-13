import { useEffect, useState } from 'react'
import type { SiteMeta } from './metrics'

interface V { site: string; utc: string; body: string; d_az: number; d_el: number; horizons_el: number; ours_el: number }

export function Methods({ index }: { index: SiteMeta[] }) {
  const [val, setVal] = useState<V[]>([])
  useEffect(() => { fetch(import.meta.env.BASE_URL + 'data/validation.json').then(r => r.json()).then(setVal).catch(() => {}) }, [])
  const maxErr = val.length ? Math.max(...val.map(v => Math.max(Math.abs(v.d_az), Math.abs(v.d_el)))) : null
  return (
    <main className="methods">
      <h2>Methods &amp; data</h2>
      <h3>What the app computes</h3>
      <p>For each site and every hour from 2026-01-01 to 2028-12-31 (UTC) we know where the Sun and Earth sit in the local sky (azimuth, elevation) and how high the surrounding terrain rises in that direction. A body is "visible" when its elevation exceeds the terrain horizon at its azimuth.</p>
      <ul>
        <li><b>Sunlit %</b>: time-averaged fraction of the solar disk above the terrain. The disk fraction is a linear approximation over the Sun's 0.53° diameter (not an exact circular-segment area).</li>
        <li><b>Longest dark</b>: the longest continuous run of hours when the Sun's centre is below the terrain (less than half the disk visible). This drives battery and heater sizing.</li>
        <li><b>Earth in view / DTE windows</b>: hours when Earth's centre is above the terrain horizon, which is a geometric line-of-sight condition for direct-to-Earth radio. It does not model ground-station availability, antenna masks, or link budgets.</li>
        <li><b>Sun + Earth</b>: hours with both the Sun's centre up and Earth in view.</li>
        <li><b>Power proxy</b>: mean of (visible disk fraction × cos(solar elevation)) for a vertical, sun-tracking panel, as a relative 0–100% figure. It is not watts.</li>
      </ul>
      <h3>Sun and Earth positions (real ephemerides)</h3>
      <p>Computed offline with NAIF SPICE (SpiceyPy) using DE440 (de440s.bsp), the high-accuracy lunar orientation kernel moon_pa_de440_200625.bpc, and frame kernel moon_de440_250416.tf, in the MOON_ME_DE440_ME421 frame (the frame LOLA products use), with light-time and stellar aberration (LT+S). The observer sits 2 m above the LOLA surface. Azimuth is measured clockwise from local north; elevation is relative to the local ellipsoid-normal (sphere) horizontal plane.</p>
      <p><b>Validation against JPL Horizons</b> (API, <code>CENTER='coord@301'</code>, quantity 4) at {val.length} site/time/body spot checks: max |Δ| = {maxErr != null ? maxErr.toFixed(3) + '°' : '…'} (our stored values are rounded to 0.01°).</p>
      {val.length > 0 && <table className="val"><thead><tr><th>Site</th><th>UTC</th><th>Body</th><th>Horizons el</th><th>Ours el</th><th>Δaz</th><th>Δel</th></tr></thead>
        <tbody>{val.map((v, i) => <tr key={i}><td>{v.site}</td><td>{v.utc}</td><td>{v.body}</td><td>{v.horizons_el.toFixed(3)}</td><td>{v.ours_el.toFixed(2)}</td><td>{v.d_az.toFixed(3)}</td><td>{v.d_el.toFixed(3)}</td></tr>)}</tbody></table>}
      <h3>Terrain horizon (real LOLA topography)</h3>
      <p>Horizons are computed from LRO LOLA gridded polar-stereographic DEMs from the PDS Geosciences Node: <b>LDEM_85S_40M</b> (40 m/pixel, 85°S to the pole) within 25 km of the site, and <b>LDEM_75S_240M</b> (240 m/pixel) from 25 to 400 km. For sites north of 85.2°S (Mons Malapert, Mons Mouton, Nobile) only the 240 m DEM is used. Every DEM pixel in range is converted to a 3-D Moon-fixed position on the 1737.4 km reference sphere plus its height; we take its elevation angle and azimuth from the observer, so lunar curvature is handled exactly. The horizon is the maximum elevation in each 0.5° azimuth bin (720 bins), linearly interpolated between bins.</p>
      <h3>Known approximations and limits</h3>
      <ul>
        <li>Terrain resolution: 40 m near-field and 240 m far-field. Features smaller than that (boulders, small rims) are missing, and results can differ from high-resolution studies (e.g., 5 m PGDA products) by a few percent at ridge sites. We have <b>not</b> yet cross-validated against the PGDA illumination maps (Mazarico et al. 2011).</li>
        <li>Terrain beyond 400 km is ignored. Lunar curvature lowers such terrain below about −0.4°, which matters only in rare grazing geometries.</li>
        <li>Hourly sampling: windows and dark stretches are accurate to about ±1 h.</li>
        <li>Solar disk visibility uses a linear approximation. Earth visibility uses Earth's centre, not its ~1.9° disk.</li>
        <li>Sites: “centre” sites use USGS Gazetteer crater/mountain centre coordinates (crater floors are often in permanent shadow, which makes good contrast cases). “Derived” sites are the highest LOLA pixel in a ring or disk around a feature. They are illustrative candidates, not NASA-designated landing sites. Custom sites need re-running the Python pipeline (see README).</li>
        <li>No refraction (the Moon has no atmosphere) and no thermal or dust effects.</li>
      </ul>
      <h3>Sites</h3>
      <table className="val"><thead><tr><th>Site</th><th>Lat</th><th>Lon (E)</th><th>Elev (m)</th><th>DEM</th><th>Source</th></tr></thead>
        <tbody>{index.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.lat}</td><td>{s.lon}</td><td>{Math.round(s.elevation_m)}</td><td>{s.dem}</td><td>{s.note}</td></tr>)}</tbody></table>
      <h3>Sources</h3>
      <ul>
        <li>LRO LOLA polar gridded DEMs: Smith et al., PDS Geosciences Node, LRO-L-LOLA-3-RDR-V1 / LOLA GDR polar (https://pds-geosciences.wustl.edu/missions/lro/lola.htm). NASA, public domain.</li>
        <li>NAIF SPICE generic kernels: DE440 (Park et al. 2021), lunar PA/ME kernels, naif0012.tls, pck00011.tpc (https://naif.jpl.nasa.gov/pub/naif/generic_kernels/). Accessed via SpiceyPy (MIT).</li>
        <li>JPL Horizons API (https://ssd.jpl.nasa.gov/api/horizons.api), used for validation.</li>
        <li>USGS Gazetteer of Planetary Nomenclature (https://planetarynames.wr.usgs.gov/) for feature coordinates.</li>
      </ul>
      <h3>AI use disclosure</h3>
      <p>This prototype's code, data pipeline, and text were produced with the help of AI assistants (Grok Bot agents) under the direction of the team. All numbers come from the real NASA/JPL/USGS data listed above, computed by the open-source pipeline in this repository. No AI-generated imagery or data is used.</p>
    </main>)
}
