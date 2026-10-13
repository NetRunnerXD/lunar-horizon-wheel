import type { Ephem, Grid, SiteData, SiteMeta } from './physics'
export const BASE = import.meta.env.BASE_URL
const bin = (f: string) => fetch(BASE + 'data/' + f).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.arrayBuffer() })
const json = <T,>(f: string): Promise<T> => fetch(BASE + f).then(r => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json() })

export interface Products {
  ephem: { start: string; step_s: number; n: number; stations: { name: string }[] }
  grid: Omit<Grid, 'hz'>; overlays: { half_km: number; terrain_n: number; img_n: number; h_min: number; h_max: number }
  site_psr: Record<string, { nearest_psr_km: number | null; psr_km2_within_10km: number | null }>
}
export async function loadCore() {
  const [index, products] = await Promise.all([json<{ sites: SiteMeta[] }>('data/sites.json'), json<Products>('data/products.json')])
  const [ev, dv] = await Promise.all([bin('ephem.bin'), bin('dsn.bin')])
  const e: Ephem = { start: Date.parse(products.ephem.start), stepS: products.ephem.step_s, n: products.ephem.n, v: new Float32Array(ev), dsn: new Int16Array(dv), stations: products.ephem.stations.map(s => s.name) }
  return { index: index.sites, products, ephem: e }
}
export const loadSite = (id: string) => json<SiteData>(`data/sites/${id}.json`)
export async function loadGrid(p: Products): Promise<Grid> { return { ...p.grid, hz: new Int16Array(await bin('grid.bin')) } }
export async function loadTerrain() { return new Int16Array(await bin('terrain.bin')) }
export const loadJson = json

export interface IsroLayer { id: string; title: string; attribution: string; licence: string; features: GeoJSON[] }
export interface GeoJSON { type: 'Feature'; geometry: { type: 'Point'; coordinates: [number, number] }; properties: Record<string, unknown> }
/** Optional third-party layers (data/layers/manifest.json). Missing manifest => no layers. */
export async function loadLayers(): Promise<IsroLayer[]> {
  try {
    const m = await json<{ layers: { id: string; title: string; file: string; attribution: string; licence: string }[] }>('data/layers/manifest.json')
    return await Promise.all(m.layers.map(async l => ({ ...l, features: (await json<{ features: GeoJSON[] }>('data/layers/' + l.file)).features })))
  } catch { return [] }
}
