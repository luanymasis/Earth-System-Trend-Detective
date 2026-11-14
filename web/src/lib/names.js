// Utilidades geográficas del cliente.
const D2R = Math.PI / 180

/** Distancia de gran círculo en km. a, b = { lat, lon } */
export function km (a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R
  return 6371 * Math.acos(Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl)))
}
