import * as d3 from 'd3'
import type { Series } from './metrics'
import { runs } from './metrics'

export function Timeline({ rows, from, to, cursorMs, onPick }: {
  rows: { name: string; s: Series }[]; from: number; to: number; cursorMs: number; onPick: (ms: number) => void
}) {
  const W = 900, L = 190, rowH = 30, H = rows.length * rowH * 2 + 26
  const x = d3.scaleUtc().domain([from, to]).range([L, W - 10])
  const ticks = x.ticks(8)
  const fmt = x.tickFormat(8)
  const span = (s: Series, m: boolean[], y: number, cls: string) => runs(m).map((w, k) => {
    const x0 = x(s.t[w.start]), x1 = x(s.t[w.end - 1] + 3600e3)
    return <rect key={cls + k} x={x0} y={y} width={Math.max(0.6, x1 - x0)} height={rowH - 8} className={cls} />
  })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="timeline" role="img" aria-label="Sunlight and Earth-visibility timeline"
      onClick={e => {
        const svg = e.currentTarget, pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY
        const p = pt.matrixTransform(svg.getScreenCTM()!.inverse()); if (p.x >= L) onPick(+x.invert(p.x))
      }}>
      {rows.map((r, i) => {
        const y = i * rowH * 2
        return <g key={r.name}>
          <text x={L - 8} y={y + 18} className="tl-label">{r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name} ☀</text>
          <text x={L - 8} y={y + rowH + 18} className="tl-label">Earth (DTE)</text>
          <rect x={L} y={y + 4} width={W - 10 - L} height={rowH - 8} className="tl-bg" />
          <rect x={L} y={y + rowH + 4} width={W - 10 - L} height={rowH - 8} className="tl-bg" />
          {span(r.s, r.s.sunFrac.map(f => f >= 0.5), y + 4, 'tl-sun')}
          {span(r.s, r.s.earthVis, y + rowH + 4, 'tl-earth')}
        </g>
      })}
      {ticks.map(t => <g key={+t}><line x1={x(t)} x2={x(t)} y1={0} y2={H - 20} className="tl-tick" /><text x={x(t)} y={H - 6} className="tl-ticklabel">{fmt(t)}</text></g>)}
      <line x1={x(cursorMs)} x2={x(cursorMs)} y1={0} y2={H - 20} className="tl-cursor" />
    </svg>
  )
}
