import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { BASE, loadTerrain, type Products } from './data'
import { xyFromLatLon, type SiteMeta } from './physics'

/** LOLA terrain (LDEM_80S_40M resampled to 256x256 over ±150 km), lit by the Sun direction at the time cursor. */
export function Terrain3D({ products, index, selected, sunVec }: { products: Products; index: SiteMeta[]; selected: string[]; sunVec: number[] | null }) {
  const host = useRef<HTMLDivElement>(null)
  const st = useRef<{ light?: THREE.DirectionalLight; mat?: THREE.MeshStandardMaterial; tex: Record<string, THREE.Texture>; markers?: THREE.Group; mesh?: THREE.Mesh; render?: () => void }>({ tex: {} })
  const [tex, setTex] = useState('hillshade')
  const [exag, setExag] = useState(3)
  const [err, setErr] = useState<string | null>(null)
  const half = products.overlays.half_km, n = products.overlays.terrain_n

  useEffect(() => {
    const el = host.current!; let raf = 0, alive = true
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }) } catch (e) { setErr('WebGL unavailable: ' + e); return }
    renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#05070c')
    const cam = new THREE.PerspectiveCamera(45, 1, 0.5, 5000); cam.position.set(0, 160, 230)
    const ctl = new OrbitControls(cam, renderer.domElement); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI * 0.49
    scene.add(new THREE.AmbientLight(0x404858, 0.35))
    const light = new THREE.DirectionalLight(0xfff4e0, 2.6); scene.add(light); st.current.light = light
    const loader = new THREE.TextureLoader()
    for (const k of ['hillshade', 'pgda_sun', 'pgda_earth', 'psr']) { const t = loader.load(`${BASE}data/${k}.png`, () => st.current.render?.()); t.colorSpace = THREE.SRGBColorSpace; st.current.tex[k] = t }
    const mat = new THREE.MeshStandardMaterial({ map: st.current.tex.hillshade, roughness: 1, metalness: 0 }); st.current.mat = mat
    const geo = new THREE.PlaneGeometry(2 * half, 2 * half, n - 1, n - 1); geo.rotateX(-Math.PI / 2)
    const mesh = new THREE.Mesh(geo, mat); scene.add(mesh); st.current.mesh = mesh
    const markers = new THREE.Group(); scene.add(markers); st.current.markers = markers
    loadTerrain().then(h => {
      if (!alive) return
      const pos = geo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < n * n; i++) pos.setY(i, h[i] / 1000)
      pos.needsUpdate = true; geo.computeVertexNormals(); mesh.userData.h = h
      st.current.render?.()
    }).catch(e => setErr(String(e)))
    const resize = () => { const w = el.clientWidth, hh = Math.max(320, Math.min(640, w * 0.62)); renderer.setSize(w, hh); cam.aspect = w / hh; cam.updateProjectionMatrix() }
    resize(); const ro = new ResizeObserver(resize); ro.observe(el)
    const loop = () => { ctl.update(); renderer.render(scene, cam); raf = requestAnimationFrame(loop) }
    st.current.render = () => renderer.render(scene, cam); loop()
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.removeChild(renderer.domElement) }
  }, [half, n])

  useEffect(() => { const m = st.current.mat; if (m) { m.map = st.current.tex[tex]; m.needsUpdate = true } }, [tex])
  useEffect(() => {
    const g = st.current.markers; if (!g) return
    g.clear()
    for (const s of index) {
      const p = xyFromLatLon(s.lat, s.lon); if (Math.abs(p.x) > half * 1e3 || Math.abs(p.y) > half * 1e3) continue
      const on = selected.includes(s.id)
      const m = new THREE.Mesh(new THREE.ConeGeometry(on ? 2.2 : 1.4, on ? 7 : 4, 12), new THREE.MeshBasicMaterial({ color: on ? 0xffc23d : 0xffffff }))
      m.rotation.x = Math.PI; m.position.set(p.x / 1000, (s.elevation_m * exag) / 1000 + (on ? 5 : 3), -p.y / 1000); g.add(m)
    }
  }, [index, selected, half, exag])
  useEffect(() => {
    const L = st.current.light; if (!L || !sunVec) return
    // Moon-ME (X lon0, Y lon90, Z north) -> scene (x = map x = ME Y, y = up = -ME Z, z = -map y = -ME X)
    const v = new THREE.Vector3(sunVec[1], -sunVec[2], -sunVec[0]).normalize()
    L.position.copy(v.multiplyScalar(1000))
  }, [sunVec])
  useEffect(() => { st.current.mesh?.scale.set(1, exag, 1) }, [exag])

  return (
    <div className="t3d">
      <div className="t3d-ctl" role="group" aria-label="3D view options">
        <label>Texture <select value={tex} onChange={e => setTex(e.target.value)}>
          <option value="hillshade">LOLA hillshade</option><option value="pgda_sun">Avg. solar illumination (PGDA)</option><option value="pgda_earth">Avg. Earth visibility (PGDA)</option><option value="psr">PSRs only</option></select></label>
        <label>Vertical exaggeration <input type="range" min={1} max={8} step={0.5} value={exag} onChange={e => setExag(+e.target.value)} /> {exag}×</label>
        <span className="small">Drag to orbit, scroll to zoom. Lighting follows the real Sun direction at the time cursor (sun elevation at the pole is only ~±1.5°).</span>
      </div>
      {err && <div className="error">{err}</div>}
      <div ref={host} className="t3d-host" aria-label="3D south-pole terrain" role="img" />
    </div>
  )
}
