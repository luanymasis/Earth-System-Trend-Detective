# Pulso Verde

Herramienta para evaluar **eventos de deforestación, incendio y reforestación**: cómo se alteraron la vegetación, la temperatura de superficie, la humedad del suelo y la lluvia respecto a una región de comparación, si el cambio es estadísticamente claro y **cuánto tardó (o tardaría) cada variable en restaurarse** (NASA Space Apps Challenge, *Earth System Trend Detective*).

> Estado: **Fase 3, H4–H5** (frontend con datos simulados + lógica con tests). Especificación: [`docs/fase3/PLAN_FASE3_PULSO_VERDE.md`](docs/fase3/PLAN_FASE3_PULSO_VERDE.md). Decisiones no cubiertas por el plan: [`DECISIONS.md`](DECISIONS.md). El explorador de tendencias de las fases 1–2 vive en la rama `legacy-pulso-terrestre`.

## Cómo correrlo

Requisito: Node 20+.

```bash
cd web
npm install
npm run mock        # datos simulados con el contrato de Fase 3 → web/public/data/ (~2 s)
npm run dev         # http://localhost:5173
npm test            # event.js, sim.js y stats.js contra docs/fase3/eventos_sinteticos_fixture.json
npm run check-links # que los enlaces de noticias respondan (antes del deploy)
```

Con datos simulados la interfaz muestra «Demo · datos simulados». Enlaces directos: `?ev=borneo&var=precip&tab=news`.

## Estructura

```
docs/fase3/   plan, prototipo de referencia y fixture de tests
web/          Vue 3 + Vite + Pinia (sitio estático)
  scripts/    mock-verde.mjs (motor sintético del prototipo), check-links.mjs
  src/lib/    event.js (análisis de eventos), sim.js (Simular), stats.js, loader.js
  src/globe/  renderer.js, field.js (capas: teselas 0.1° y grilla global 1°)
pipeline/     Python de la fase 1 (pendiente de reemplazo en H6: AppEEARS, Giovanni, CDO)
```

## Contrato de datos (`web/public/data/`)

| Archivo | Contenido |
|---|---|
| `manifest.json` | años, variables (unidades, paleta, escala, fuente), eventos (caja, comparación, teselas), capas globales |
| `events/{id}.json` | series anuales del evento y de la comparación por variable (`null` = sin dato), estaciones |
| `tiles/*.bin`, `global/*.bin` | Int16 little-endian, orden `[año][fila][columna]` (fila 0 al norte), valor = `int*scale + offset`, faltante = −32768 |

Detalle en el plan, §4.

## Método

Para cada variable se compara el evento con su región de comparación (diferencia, o % en la precipitación) respecto a lo normal antes del evento. El cambio es claro si supera 2 desviaciones de la línea base y la prueba de Welch (1947) da p < 0,05, o si dura al menos dos años seguidos. La restauración es el primer momento en que vuelve a la franja normal durante dos años; si aún no ha vuelto, se estima con la tendencia de los últimos años. Asociación, no prueba de causa.
