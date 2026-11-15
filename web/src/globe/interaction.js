// Arrastrar para girar, rueda o pellizco para acercar, clic sin arrastre para seleccionar (PLAN §7.3).

/**
 * @param {HTMLCanvasElement} canvas
 * @param {ReturnType<import('./renderer.js').createGlobe>} globe
 * @param {{ onSelect: (p:{lat:number,lon:number}) => void, onHover: (x:number, y:number, p:object|null) => void, onLeave: () => void }} cb
 * @returns {() => void} función para quitar los listeners
 */
export function attachInteraction (canvas, globe, { onSelect, onHover, onLeave }) {
  const pointers = new Map()
  let moved = 0, down = false, pinch0 = null

  const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }

  function pointerdown (e) {
    canvas.setPointerCapture(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    down = true; moved = 0
    globe.stopMotion()
    canvas.classList.add('drag')
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), z: globe.view.zoom }
    }
  }
  function pointermove (e) {
    if (pointers.has(e.pointerId)) {
      const p = pointers.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y
      p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy)
      if (pointers.size === 2 && pinch0) {
        const [a, b] = [...pointers.values()]
        globe.setZoom(pinch0.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch0.d)
      } else if (pointers.size === 1) {
        globe.rotateBy(dx, dy)
      }
      onLeave()
      return
    }
    if (e.pointerType === 'mouse') { const q = local(e); onHover(q.x, q.y, globe.unproject(q.x, q.y)) }
  }
  function end (e) {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) pinch0 = null
    if (!pointers.size) canvas.classList.remove('drag')
    if (down && moved < 6 && e.type === 'pointerup' && !pointers.size) {
      const q = local(e), p = globe.unproject(q.x, q.y)
      if (p) onSelect(p)
    }
    if (!pointers.size) down = false
  }
  function wheel (e) {
    e.preventDefault()
    globe.stopMotion()
    globe.setZoom(globe.view.zoom * Math.exp(-e.deltaY * 0.0015))
  }

  canvas.addEventListener('pointerdown', pointerdown)
  canvas.addEventListener('pointermove', pointermove)
  canvas.addEventListener('pointerup', end)
  canvas.addEventListener('pointercancel', end)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('wheel', wheel, { passive: false })
  return () => {
    canvas.removeEventListener('pointerdown', pointerdown)
    canvas.removeEventListener('pointermove', pointermove)
    canvas.removeEventListener('pointerup', end)
    canvas.removeEventListener('pointercancel', end)
    canvas.removeEventListener('pointerleave', onLeave)
    canvas.removeEventListener('wheel', wheel)
  }
}
