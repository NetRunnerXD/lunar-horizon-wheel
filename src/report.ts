import { jsPDF } from 'jspdf'
import type { Metrics, SiteData, Uncertainty } from './physics'

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
/** Text PDF report of the current comparison (no server). */
export function pdfReport(items: { d: SiteData; m: Metrics; u?: Uncertainty }[], from: number, to: number, wheels: string[]) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 18
  const line = (t: string, size = 10, bold = false) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); for (const l of doc.splitTextToSize(t, 180)) { if (y > 280) { doc.addPage(); y = 18 } doc.text(l, 15, y); y += size * 0.45 } y += 1 }
  line('Lunar Horizon Wheel - site report', 18, true)
  line(`Period: ${iso(from)} to ${iso(to)}   Generated: ${iso(Date.now())}`)
  line(location.href, 8)
  y += 2
  items.forEach(({ d, m, u }, k) => {
    line(`${d.name}  (${d.lat.toFixed(3)} deg, ${d.lon.toFixed(3)} deg E, ${Math.round(d.elevation_m)} m; ${d.dem})`, 12, true)
    if (wheels[k]) { if (y > 200) { doc.addPage(); y = 18 } doc.addImage(wheels[k], 'PNG', 15, y, 60, 60); }
    const x0 = wheels[k] ? 80 : 15, y0 = y
    const rows = [
      ['Sunlit (limb-darkened disk)', `${m.sunlitPct.toFixed(1)} %` + (u ? `  [${u.sunlit.lo.toFixed(1)}-${u.sunlit.hi.toFixed(1)}]` : '')],
      ['Longest dark', `${m.longestDarkH.toFixed(1)} h` + (u ? `  [${u.dark.lo.toFixed(0)}-${u.dark.hi.toFixed(0)}]` : '')],
      ['Earth in view', `${m.earthPct.toFixed(1)} %` + (u ? `  [${u.earth.lo.toFixed(1)}-${u.earth.hi.toFixed(1)}]` : '')],
      ['DSN contact', `${m.dsnPct.toFixed(1)} %  (${m.dsnWindows.length} windows)`],
      ['Sun + Earth', `${m.bothPct.toFixed(1)} %`], ['Power proxy', `${(m.powerProxy * 100).toFixed(1)} %`],
      ['DTE windows', `${m.dteWindows.length}`],
    ]
    doc.setFontSize(10)
    rows.forEach(([a, b], i) => { doc.setFont('helvetica', 'normal'); doc.text(a, x0, y0 + 5 + i * 6); doc.setFont('helvetica', 'bold'); doc.text(b, x0 + 55, y0 + 5 + i * 6) })
    y = Math.max(y0 + 5 + rows.length * 6, wheels[k] ? y0 + 62 : 0) + 4
    if (!u?.demAvailable) line('DEM-resolution uncertainty not available for this site (no 40 m DEM coverage).', 8)
    line('First DSN windows: ' + m.dsnWindows.slice(0, 6).map(w => `${iso(w.start)} (${w.hours.toFixed(1)} h)`).join('; '), 8)
    y += 3
  })
  line('Method', 12, true)
  line('LOLA DEM horizons (40 m + 240 m, 400 km) with SPICE DE440 Sun/Earth geometry at a 10-minute step; finite limb-darkened solar disk; Earth centre vs terrain; DSN contact = Earth in view and Moon >=10 deg above Goldstone, Madrid or Canberra. Ranges in brackets: envelope over time step, Sun-disk model and DEM resolution. Validated against NASA GSFC PGDA/LOLA average-visibility maps (see METHODS.md). Not an official NASA product.', 9)
  line('Data: NASA LRO LOLA (PDS), NASA GSFC PGDA, NASA JPL NAIF SPICE. Built for NASA Space Apps 2026.', 8)
  doc.save('lunar-horizon-wheel-report.pdf')
}

/** Rasterise an on-page SVG (with computed styles inlined) to a PNG data URL. */
export async function svgToPng(svg: SVGSVGElement, px = 600): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const src = svg.querySelectorAll('*'), dst = clone.querySelectorAll('*')
  src.forEach((el, i) => { const cs = getComputedStyle(el); (dst[i] as SVGElement).setAttribute('style', `fill:${cs.fill};stroke:${cs.stroke};stroke-width:${cs.strokeWidth};opacity:${cs.opacity};stroke-dasharray:${cs.strokeDasharray};font-size:${cs.fontSize};font-family:sans-serif`) })
  clone.setAttribute('width', String(px)); clone.setAttribute('height', String(px))
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }))
  const img = new Image(); img.src = url; await img.decode()
  const c = document.createElement('canvas'); c.width = c.height = px
  const g = c.getContext('2d')!; g.fillStyle = '#0b0e14'; g.fillRect(0, 0, px, px); g.drawImage(img, 0, 0, px, px)
  URL.revokeObjectURL(url); return c.toDataURL('image/png')
}
