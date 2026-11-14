// Escenarios "¿Y si se calienta?" (PLAN §5). regressGT llega en H6.

/** Nivel de confianza según cuánto se extrapola respecto al calentamiento observado. */
export function xLevel (x, obsWarming) {
  if (x <= obsWarming * 1.05) return { t: 'Dentro de lo observado', c: '#606c38', k: 3 }
  if (x <= obsWarming * 2.5) return { t: 'Extrapolación moderada', c: '#dda15e', k: 2 }
  return { t: 'Especulativo', c: '#bc6c25', k: 1 }
}
