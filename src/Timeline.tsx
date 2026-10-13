import * as d3 from 'd3'
import type { Series } from './physics'
import { runs } from './physics'

export function Timeline({ rows, from, to, cursorMs, onPick }: {
  rows: { name: string; s: Series }[]; from: number; to: number; cursorMs: number; onPick: (ms: number) => void
}) {
  const W = 900, L = 190, rowH = 24, per = 3, H = rows.length * rowH * per + 30
  const x = d3.scaleUtc().domain([from, to]).range([L, W - 10])
  const ticks = x.ticks(8), fmt = x.tickFormat(8)
  const span = (s: Series, m: boolean[], y: number, cls: string) => runs(m).map((w, k) => {
    const x0 = x(s.t[w.start]), x1 = x(s.t[w.end - 1] + s.stepH * 3600e3)
    return <rect key={cls + k} x={x0} y={y} width={Math.max(0.6, x1 - x0)} height={rowH - 7} className={cls} />
  })
  const pick = (clientX: number, svg: SVGSVGElement) => {
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = 0
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse()); if (p.x >= L) onPick(+x.invert(p.x))
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="timeline" role="img"
      aria-label="Timeline of sunlight, Earth visibility and DSN contact for each selected site. Click to move the time cursor."
      onClick={e => pick(e.clientX, e.currentTarget)}>
      {rows.map((r, i) => {
        const y = i * rowH * per
        const lab = r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name
        return <g key={r.name}>
          {[['☀ ' + lab, 'tl-sun', r.s.sunFrac.map(f => f >= 0.5)], ['Earth in view', 'tl-earth', r.s.earthVis], ['DSN contact', 'tl-dsn', r.s.dsnVis]].map(([t, c, m], k) => (
            <g key={k}>
              <text x={L - 8} y={y + k * rowH + 15} className="tl-label">{t as string}</text>
              <rect x={L} y={y + k * rowH + 3} width={W - 10 - L} height={rowH - 7} className="tl-bg" />
              {span(r.s, m as boolean[], y + k * rowH + 3, c as string)}
            </g>))}
        </g>
      })}
      {ticks.map(t => <g key={+t}><line x1={x(t)} x2={x(t)} y1={0} y2={H - 22} className="tl-tick" /><text x={x(t)} y={H - 8} className="tl-ticklabel">{fmt(t)}</text></g>)}
      <line x1={x(cursorMs)} x2={x(cursorMs)} y1={0} y2={H - 22} className="tl-cursor" />
    </svg>
  )
}
