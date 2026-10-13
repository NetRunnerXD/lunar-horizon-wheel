import { useEffect, useRef, useState } from 'react'
import { BASE, type IsroLayer, type Products } from './data'
import { latLonFromXY, xyFromLatLon, type SiteMeta } from './physics'
import clps from './clps.json'

type Overlay = 'none' | 'sun' | 'earth'
export function MapView({ products, index, selected, layers, onPick, onToggle }: {
  products: Products; index: SiteMeta[]; selected: string[]; layers: IsroLayer[]
  onPick: (lat: number, lon: number) => void; onToggle: (id: string) => void
}) {
  const half = products.overlays.half_km * 1e3, N = 640
  const cv = useRef<HTMLCanvasElement>(null)
  const [overlay, setOverlay] = useState<Overlay>('sun')
  const [psr, setPsr] = useState(true)
  const [isroOn, setIsroOn] = useState<Record<string, boolean>>({})
  const geoLayers = layers.filter(l => l.image && l.bounds_ps_m)
  const [opacity, setOpacity] = useState(0.75)
  const [cross, setCross] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [imgs, setImgs] = useState<Record<string, HTMLImageElement>>({})
  useEffect(() => {
    for (const k of ['hillshade', 'pgda_sun', 'pgda_earth', 'psr']) {
      const im = new Image(); im.onload = () => setImgs(o => ({ ...o, [k]: im })); im.src = `${BASE}data/${k}.png`
    }
  }, [])
  useEffect(() => { for (const l of layers) if (l.image && l.bounds_ps_m) { const im = new Image(); im.onload = () => setImgs(o => ({ ...o, [l.id]: im })); im.src = l.image } }, [layers])
  const toPx = (x: number, y: number) => [(x / half + 1) / 2 * N, (1 - y / half) / 2 * N]
  useEffect(() => {
    const c = cv.current?.getContext('2d'); if (!c) return
    c.clearRect(0, 0, N, N)
    if (imgs.hillshade) c.drawImage(imgs.hillshade, 0, 0, N, N)
    const ov = overlay === 'sun' ? imgs.pgda_sun : overlay === 'earth' ? imgs.pgda_earth : null
    if (ov) { c.globalAlpha = opacity; c.drawImage(ov, 0, 0, N, N); c.globalAlpha = 1 }
    for (const l of geoLayers) if (isroOn[l.id] && imgs[l.id]) {
      const [x0, y0, x1, y1] = l.bounds_ps_m!, [px0, py1] = toPx(x0, y1), [px1, py0] = toPx(x1, y0)
      c.globalAlpha = 0.85; c.drawImage(imgs[l.id], px0, py1, px1 - px0, py0 - py1); c.globalAlpha = 1
      c.strokeStyle = '#ff9933'; c.strokeRect(px0, py1, px1 - px0, py0 - py1)
    }
    if (psr && imgs.psr) c.drawImage(imgs.psr, 0, 0, N, N)
    // graticule
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1; c.setLineDash([3, 4])
    for (const lat of [-89, -88, -87, -86, -85]) { const r = xyFromLatLon(lat, 0).y / half * N / 2; c.beginPath(); c.arc(N / 2, N / 2, Math.abs(r), 0, 7); c.stroke() }
    for (let lon = 0; lon < 360; lon += 30) { const p = xyFromLatLon(-84, lon); const [px, py] = toPx(p.x, p.y); c.beginPath(); c.moveTo(N / 2, N / 2); c.lineTo(px, py); c.stroke() }
    c.setLineDash([])
    c.font = '11px system-ui'; c.textAlign = 'left'
    for (const s of index) {
      const p = xyFromLatLon(s.lat, s.lon); if (Math.abs(p.x) > half || Math.abs(p.y) > half) continue
      const [px, py] = toPx(p.x, p.y), on = selected.includes(s.id)
      c.fillStyle = on ? '#ffc23d' : '#fff'; c.strokeStyle = '#000'; c.beginPath(); c.arc(px, py, on ? 6 : 4, 0, 7); c.fill(); c.stroke()
      c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.8)'; c.lineWidth = 3; c.strokeText(s.name, px + 8, py + 4); c.fillText(s.name, px + 8, py + 4); c.lineWidth = 1
    }
    for (const m of clps.missions) if (m.lat != null && m.lon != null && m.lat < -80) {
      const p = xyFromLatLon(m.lat, m.lon); if (Math.abs(p.x) > half || Math.abs(p.y) > half) continue
      const [px, py] = toPx(p.x, p.y); c.fillStyle = '#ff5d8f'; c.fillRect(px - 4, py - 4, 8, 8)
    }
    const [cx, cy] = toPx(cross.x, cross.y)
    c.strokeStyle = '#9be15d'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 10, cy); c.lineTo(cx + 10, cy); c.moveTo(cx, cy - 10); c.lineTo(cx, cy + 10); c.stroke(); c.lineWidth = 1
  }, [imgs, overlay, psr, opacity, index, selected, cross, half, isroOn, geoLayers])

  const ll = latLonFromXY(cross.x, cross.y)
  const offMap = [...index.filter(s => { const p = xyFromLatLon(s.lat, s.lon); return Math.abs(p.x) > half || Math.abs(p.y) > half }).map(s => `${s.name} (${s.lat.toFixed(2)}°, ${s.lon.toFixed(2)}°)`),
    ...clps.missions.filter(m => m.lat != null && m.polar).filter(m => { const p = xyFromLatLon(m.lat!, m.lon!); return Math.abs(p.x) > half || Math.abs(p.y) > half }).map(m => `${m.name} (${m.lat}°, ${m.lon}°)`),
  ]
  const pickAt = (clientX: number, clientY: number) => {
    const r = cv.current!.getBoundingClientRect()
    setCross({ x: ((clientX - r.left) / r.width * 2 - 1) * half, y: (1 - (clientY - r.top) / r.height * 2) * half })
  }
  return (
    <div className="mapwrap">
      <div className="mapcol">
        <canvas ref={cv} width={N} height={N} className="map" tabIndex={0} role="application"
          aria-label={`South-pole map. Crosshair at ${ll.lat.toFixed(3)}°, ${ll.lon.toFixed(2)}°E. Arrow keys move 1 km (Shift: 10 km); Enter analyses this point.`}
          onClick={e => pickAt(e.clientX, e.clientY)} onDoubleClick={() => onPick(ll.lat, ll.lon)}
          onKeyDown={e => {
            const k = (e.shiftKey ? 10 : 1) * 1000
            const d: Record<string, [number, number]> = { ArrowLeft: [-k, 0], ArrowRight: [k, 0], ArrowUp: [0, k], ArrowDown: [0, -k] }
            if (d[e.key]) { e.preventDefault(); setCross(c => ({ x: Math.max(-half, Math.min(half, c.x + d[e.key][0])), y: Math.max(-half, Math.min(half, c.y + d[e.key][1])) })) }
            if (e.key === 'Enter') onPick(ll.lat, ll.lon)
          }} />
        <p className="small">Polar stereographic, ±{half / 1e3} km around the pole; 0°E (Earth-facing) is up. Click to place the crosshair, double-click or press Enter to analyse it.</p>
      </div>
      <aside className="mapside">
        <fieldset><legend>Overlay</legend>
          {([['sun', 'Avg. solar illumination (PGDA/LOLA)'], ['earth', 'Avg. Earth visibility (PGDA/LOLA)'], ['none', 'Hillshade only']] as const).map(([k, l]) =>
            <label key={k} className="row"><input type="radio" name="ov" checked={overlay === k} onChange={() => setOverlay(k)} /> {l}</label>)}
          <label className="row">Opacity <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={e => setOpacity(+e.target.value)} aria-label="Overlay opacity" /></label>
          <label className="row"><input type="checkbox" checked={psr} onChange={e => setPsr(e.target.checked)} /> Permanently shadowed regions (LOLA LPSR)</label>
          {geoLayers.map(l => <label key={l.id} className="row"><input type="checkbox" checked={!!isroOn[l.id]} onChange={e => setIsroOn(o => ({ ...o, [l.id]: e.target.checked }))} /> {l.title} <em className="tag isro">ISRO</em></label>)}
          {geoLayers.length > 0 && <p className="small">ISRO footprints are outlined in orange and may extend beyond this map. Captions and caveats are in the cards below.</p>}
          <div className={'ramp ' + overlay} aria-hidden /><div className="ramp-l"><span>0%</span><span>time visible</span><span>100%</span></div>
        </fieldset>
        <fieldset><legend>Custom site</legend>
          <p className="mono">{ll.lat.toFixed(4)}°, {ll.lon.toFixed(3)}°E</p>
          <button className="primary" onClick={() => onPick(ll.lat, ll.lon)}>Analyse this point</button>
          <p className="small">Horizon is blended from a precomputed 5 km grid of ray-marched 2° horizons (LOLA 40 m + 240 m). Coarser than the curated sites: see Methods §C for its error.</p>
        </fieldset>
        <fieldset><legend>Sites</legend>
          <div className="site-list">{index.map(s => <button key={s.id} className={selected.includes(s.id) ? 'chip on' : 'chip'} aria-pressed={selected.includes(s.id)} onClick={() => onToggle(s.id)}>{s.name}</button>)}</div>
          {layers.length > 0 && <p className="small">ISRO layers loaded: {layers.map(l => l.title).join('; ')} (details below; Shiv Shakti is at 69.37°S, outside this map).</p>}
          <p className="small"><span className="sq" /> CLPS landing sites on the map. Outside this map: {offMap.join('; ')}.</p>
        </fieldset>
      </aside>
    </div>
  )
}
