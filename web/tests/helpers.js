// Utilidades compartidas de los tests.

/** RNG reproducible (mulberry32 + Box-Muller) para series de prueba. */
export function rng (seed) {
  let a = seed
  const u = () => {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
  const g = () => { let x = 0; while (x === 0) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()) }
  return { u, g }
}
