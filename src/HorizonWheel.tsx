import * as d3 from 'd3'
import { useMemo } from 'react'
import type { Series } from './physics'

const EL_MIN = -8

export function HorizonWheel({ horizon, alt, step, s, cursor, size = 300, label }: {
  horizon: number[]; alt?: number[]; step: number; s: Series; cursor: number | null; size?: number; label?: string
}) {
  const R = size / 2 - 22
  const top = Math.max(...horizon, 4)
  const EL_MAX = Math.ceil((top + 3) / 2) * 2 // zoom so the terrain uses the plot
  const rings = EL_MAX > 16 ? [0, 10, 20] : EL_MAX > 8 ? [0, 5, 10] : [0, 2, 4, 6]
  const r = d3.scaleLinear().domain([EL_MAX, EL_MIN]).range([0, R]).clamp(true)
  const pt = (az: number, el: number): [number, number] => {
    const a = (az * Math.PI) / 180, rr = r(el)
    return [rr * Math.sin(a), -rr * Math.cos(a)]
  }
  const terrain = useMemo(() => {
    const ring = horizon.map((h, i) => pt((i + 0.5) * step, h))
    const inner = 'M' + ring.map(p => p.join(',')).join('L') + 'Z'
    const outer = `M0,${-R}A${R},${R} 0 1,1 0,${R}A${R},${R} 0 1,1 0,${-R}Z`
    return outer + inner
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [horizon, step, size])
  const stride = Math.max(1, Math.ceil(s.t.length / 2500))
  const idx = useMemo(() => d3.range(0, s.t.length, stride), [s, stride])
  const ci = cursor
  return (
    <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} width="100%" role="img"
      aria-label={label ?? 'Horizon wheel: terrain horizon with Sun and Earth paths'} className="wheel">
      <circle r={R} className="sky" />
      {rings.filter(e => e < EL_MAX).map(e => <circle key={e} r={r(e)} className={e === 0 ? 'ring ring0' : 'ring'} />)}
      {d3.range(0, 360, 30).map(a => { const [x, y] = pt(a, EL_MIN); return <line key={a} x1={0} y1={0} x2={x} y2={y} className="spoke" /> })}
      <path d={terrain} className="terrain" fillRule="evenodd" />
      <path d={'M' + horizon.map((h, i) => pt((i + 0.5) * step, h).join(',')).join('L') + 'Z'} className="horizon-line" />
      {alt && <path d={'M' + alt.map((h, i) => pt((i + 0.5) * (360 / alt.length), h).join(',')).join('L') + 'Z'} className="horizon-alt"><title>Horizon from 240 m DEM only (DEM-resolution uncertainty)</title></path>}
      {idx.map(i => { const [x, y] = pt(s.earthAz[i], s.earthEl[i]); return <circle key={'e' + i} cx={x} cy={y} r={1.2} className={s.earthVis[i] ? 'earth-up' : 'earth-down'} /> })}
      {idx.map(i => { const [x, y] = pt(s.sunAz[i], s.sunEl[i]); return <circle key={'s' + i} cx={x} cy={y} r={1.2} className={s.sunFrac[i] >= 0.5 ? 'sun-up' : 'sun-down'} /> })}
      {ci != null && ci >= 0 && ci < s.t.length && (<>
        <circle cx={pt(s.earthAz[ci], s.earthEl[ci])[0]} cy={pt(s.earthAz[ci], s.earthEl[ci])[1]} r={6} className={'marker earth ' + (s.earthVis[ci] ? 'on' : 'off')}><title>Earth</title></circle>
        <circle cx={pt(s.sunAz[ci], s.sunEl[ci])[0]} cy={pt(s.sunAz[ci], s.sunEl[ci])[1]} r={7} className={'marker sun ' + (s.sunFrac[ci] >= 0.5 ? 'on' : 'off')}><title>Sun</title></circle>
      </>)}
      {(['N', 'E', 'S', 'W'] as const).map((l, k) => { const [x, y] = pt(k * 90, EL_MIN - 3.2); return <text key={l} x={x} y={y} className="compass">{l}</text> })}
      {rings.filter(e => e < EL_MAX).map(e => <text key={'t' + e} x={3} y={-r(e) - 2} className="ring-label">{e}°</text>)}
    </svg>
  )
}
