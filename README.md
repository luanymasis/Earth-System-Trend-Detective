# Pulso Verde

Herramienta para evaluar **eventos de deforestación, incendio y reforestación**: cómo se alteraron la vegetación, la temperatura de superficie, la humedad del suelo y la lluvia respecto a una región de comparación, si el cambio es estadísticamente claro y **cuánto tardó (o tardaría) cada variable en restaurarse** (NASA Space Apps Challenge, *Earth System Trend Detective*).

> Estado: **Fase 3, H4–H5 terminados; H6–H7 en curso** (los datos se leen únicamente de fuentes reales y lo que falte se muestra como no disponible). Especificación: [`docs/fase3/PLAN_FASE3_PULSO_VERDE.md`](docs/fase3/PLAN_FASE3_PULSO_VERDE.md). Decisiones no cubiertas por el plan: [`DECISIONS.md`](DECISIONS.md). El explorador de tendencias de las fases 1–2 vive en la rama `legacy-pulso-terrestre`.

## Cómo correrlo

Requisito: Node 20+.

```bash
cd web
npm install
npm run dev         # http://localhost:5173
npm test            # event.js, sim.js y stats.js contra docs/fase3/eventos_sinteticos_fixture.json
npm run check-links # que los enlaces de noticias respondan (antes del deploy)
```

Si falta el manifiesto, una serie o una capa, la interfaz muestra un aviso discreto y deja los datos ausentes como no disponibles. Enlaces directos: `?ev=borneo&var=precip&tab=news`.

### Datos reales (H6–H7)

Requisito: Python 3.11, `pip install -r pipeline/requirements.txt` y una cuenta de Earthdata Login con la app «NASA GESDISC DATA ARCHIVE» autorizada. Credenciales en `EARTHDATA_TOKEN` o en `~/.netrc` (`_netrc` en Windows), nunca en el repo.

```bash
cd pipeline
python gldas.py fetch --only 2016-05   # probar con un mes
python gldas.py fetch --workers 3      # GLDAS_NOAH025_M.2.1, 2001–2024 (se reanuda; el crudo se borra)
python gldas.py aggregate              # exporta valores mensuales → pipeline/out/ + SOURCES.csv
python build_events.py                 # contrato en web/public/data (lo que falte queda sin datos)
cd ../web && npm run validate          # placebos, sensibilidad y verificación → docs/VALIDATION.md
```

Los eventos y sus regiones de comparación se definen en `pipeline/events.yaml`.

## Estructura

```
docs/fase3/   plan, prototipo de referencia y fixture de tests
web/          Vue 3 + Vite + Pinia (sitio estático)
  scripts/    check-links.mjs, validate.mjs
  src/lib/    event.js (análisis de eventos), sim.js (Simular), stats.js, loader.js
  src/globe/  renderer.js, field.js (capas: teselas 0.1° y grilla global 1°)
pipeline/     events.yaml, gldas.py (humedad + verificación de temperatura del aire), build_events.py, SOURCES.csv
              (pendiente: AppEEARS para vegetación y LST, IMERG vía Giovanni, CDO)
```

## Contrato de datos (`web/public/data/`)

| Archivo | Contenido |
|---|---|
| `manifest.json` | fechas mensuales, variables (unidades, paleta, escala, fuente), eventos (caja, comparación, teselas), capas globales |
| `events/{id}.json` | series mensuales del evento y de la comparación por variable (`null` = sin dato), series de verificación (`verify`), estaciones |
| `tiles/*.bin`, `global/*.bin` | Int16 little-endian, orden `[mes][fila][columna]` (fila 0 al norte), valor = `int*scale + offset`, faltante = −32768 |

Detalle en el plan, §4.

## Método

Para cada variable se compara el evento con su región de comparación (diferencia, o % en la precipitación) respecto a lo normal antes del evento. El cambio es claro si supera 2 desviaciones de la línea base y la prueba de Welch (1947) da p < 0,05, o si dura al menos dos meses seguidos. La restauración es el primer momento en que vuelve a la franja normal durante dos meses; si aún no ha vuelto, se estima con la tendencia de los últimos meses. Asociación, no prueba de causa.
