# Pulso Verde: Fase 3, del prototipo a código con datos reales

> **Para Claude Code:** este documento **reemplaza la dirección del producto** de `PLAN_PULSO_TERRESTRE.md` y `PLAN_FASE2_FUENTES_PERMITIDAS.md`. Los hitos **H1–H3 ya están terminados**: esqueleto + mock, globo y panel de zona. El producto cambió: ya no es un explorador de tendencias globales, sino una herramienta para **evaluar eventos de deforestación, incendio y reforestación**. Muestra cómo se alteran Temperatura, Vegetación, Humedad y Precipitación, y **cuánto tardan en restaurarse**.
>
> **Archivos de referencia junto a este plan:**
> - `prototipo-pulso-verde.html`: el prototipo funcional, un solo archivo. **Porta su lógica; no la reinventes.** Contiene código muerto que debes ignorar: `CONS`, `consLevels`, `consList`, `flowSVG`, `renderCons`, `renderCompare`, `typeLines`, `summaryType`.
> - `eventos_sinteticos_fixture.json`: series de los 8 eventos sintéticos del prototipo y el resultado esperado del análisis (`expected`) y de la simulación (`empirical`). Son los **tests de referencia** de tu port.
>
> **Qué sigue vigente de los planes anteriores:**
> - Principios de producto: lenguaje cotidiano y honestidad estadística.
> - Stack: Vue 3 + Vite + Pinia + d3, hosting estático.
> - Paleta de la UI y reglas de calidad y accesibilidad.
> - Las reglas de fuentes permitidas y la trazabilidad en `SOURCES.csv`.
> - Las reglas para Claude Code de ambos documentos.
>
> **Qué queda reemplazado:** catálogo de variables, contrato de datos, modos, panel de zona, Descubrir y los hitos H4–H8.

---

## 0. El producto en una frase

Eliges un evento real (por ejemplo, el pico de deforestación de Rondônia en 2004). El globo muestra año a año cómo se alejaron de lo normal la vegetación, la temperatura de superficie, la humedad del suelo y la lluvia. El panel dice en lenguaje sencillo:
- qué cambió y si el cambio es estadísticamente claro;
- si ya se recuperó y en cuántos años, o cuánto le faltaría.

Hay una pestaña de **Noticias** reales sobre el evento y otra de **Simular** ("¿qué pasaría si se talan o se reforestan X puntos de cobertura?"). La simulación se aprende de los eventos reales.

**Cómo encaja en el challenge:**

| El challenge pide | Nuestra respuesta |
|---|---|
| Seleccionar variables | 4 chips de variable |
| Ver cambios en el tiempo | Reproducción año a año en el globo |
| Qué cambia, dónde y cuánto | Evento vs región de comparación |
| Si es significativo | Welch + umbral de 2 desviaciones respecto a lo normal antes del evento |
| Una misma variable puede subir en un lugar y bajar en otro | Deforestación vs reforestación |

---

## 1. Fuentes de datos: qué sale de cada una

Solo se usan las 5 fuentes permitidas por los organizadores. Cada variable tiene **una fuente principal** y, cuando es posible, **una fuente de verificación** independiente.

| Variable (UI) | Fuente principal | Producto candidato (verificar el nombre exacto en la herramienta) | Verificación |
|---|---|---|---|
| **Vegetación**: cobertura arbórea, % | **AppEEARS** | MODIS VCF `MOD44B.061`, capa `Percent_Tree_Cover`, anual, 250 m | Opcional: NDVI `MOD13A3.061` (mensual, 1 km) y área quemada `MCD64A1.061` para confirmar el año de los incendios |
| **Temperatura**: superficie de día, °C | **AppEEARS** | **Preferido:** LST mensual a 6 km (`MOD11B3.061`, si AppEEARS lo ofrece). **Alternativa:** `MOD11A2.061` (8 días, 1 km), solo las capas `LST_Day_1km` y `QC_Day` | **CDO / GSOY** `TAVG`. Es temperatura del aire, no de superficie: se compara la dirección del cambio, no la magnitud |
| **Humedad**: suelo 0–10 cm, m³/m³ | **Giovanni** | GLDAS Noah 2.1 mensual 0.25°, `SoilMoi0_10cm_inst` | **Hydrology Time Series** (data rods de GLDAS en el centro del evento y del control) |
| **Precipitación**: % respecto a lo normal | **Giovanni** | GPM IMERG mensual v07 (`GPM_3IMERGM`), `precipitation` | **CDO / GSOY** `PRCP` de estaciones dentro de las cajas |
| *(metodología)* | **NTRS** | Acker et al., análisis de series temporales de clorofila SeaWiFS en regiones costeras (NTRS 20090042747) | Se cita en el README y el pitch como antecedente del análisis de series temporales con datos obtenidos de Giovanni |

### Por qué esta asignación
- **AppEEARS** es la única fuente permitida con productos MODIS de **superficie terrestre** (vegetación y LST) a alta resolución y con recorte por área. Su API permite enviar los trabajos desde un script.
- El servicio **"Time Series, Area-Averaged"** de **Giovanni** entrega directamente un CSV con la media de una caja. Es la forma más rápida y barata de obtener la lluvia y la humedad de cada región: una solicitud por caja y variable, sin descargar rasters. Sus mapas anuales alimentan la capa global del globo.
- **Hydrology Time Series** solo entrega series en un punto. Sirve para validar la humedad, no como fuente principal.
- **CDO** da observaciones en tierra, independientes de los satélites. Las estaciones son escasas en la Amazonía, el Chaco y Borneo, así que se usan como verificación y nunca como fuente principal.

### Estimación de volumen (para evitar descargas innecesarias)

| Producto | Por área (caja de ~4.4° × 4.4°, 2001–2024) | 16 áreas |
|---|---|---|
| VCF 250 m anual (1 byte por píxel) | ~90 MB | ~1.5 GB |
| LST mensual 6 km | ~5 MB | ~80 MB |
| LST 8 días 1 km (alternativa) | ~0.6 GB | ~10 GB ⚠️ |
| Giovanni, series por área | KB | KB |
| Giovanni, mapas anuales globales | ~50 MB por variable | — |

**Regla:** procesa cada área en cuanto se descargue: agrégala a series y a una tesela de 0.1° y **borra el raster crudo**. Conserva el ID del trabajo y el checksum en `SOURCES.csv` para que sea reproducible. Si te ves obligado a usar `MOD11A2`, avísame antes.

---

## 2. Qué se reutiliza de H1–H3 y qué cambia

| Ya hecho | Qué hacer | Detalle |
|---|---|---|
| Repo, Vite + Vue 3 + Pinia | **Mantener** | — |
| `loader.js` | **Adaptar** | Carga `manifest.json` y luego, de forma **diferida por evento**, `events/{id}.json` y sus teselas. Las capas globales se cargan solo al elegir su variable |
| `mock.py` | **Reemplazar** | Por `web/scripts/mock-verde.mjs`, que porta el motor sintético del prototipo (`EVENTS`, `VARS`, `regionSeries`, `makeSmooth`) y escribe **exactamente** el contrato nuevo (sección 4) con `"synthetic": true` |
| `globe/renderer.js`, `interaction.js` | **Mantener ~90 %** | Agregar marcadores de eventos por tipo, la caja del evento (borde continuo), la caja de comparación (borde punteado, con la etiqueta "Comparación: …") y `flyTo` al seleccionar un evento. Clic en un marcador = seleccionar el evento. Quitar la selección libre de zonas |
| `globe/field.js` | **Generalizar** | Interfaz `FieldSource { sample(lat, lon, tIndex) → number \| NaN }` con dos implementaciones: `GlobalGrid` (precipitación y humedad, 1°) y `TileSet` (vegetación y temperatura, teselas de 0.1° por región). El valor que se pinta es la **diferencia con el promedio de los 3 años previos al evento seleccionado** (`baseWin`); la precipitación se pinta en %. Mantener el suavizado 3×3 y el caché `fieldKey`/`layerKey` |
| `ModeSwitch.vue` y sus controles | **Eliminar** de la UI | Lo sustituye `PlaybackControl.vue`: reproducir, slider de año y leyenda. Sin texto explicativo y sin burbuja de modo |
| `zone.js` | **Mantener**, con otro uso | Media regional ponderada por cos(lat). La usan el mock y la validación; ya no la usa la UI |
| `forecast.js` | **Reducir** | Solo `fitLine`, para estimar la recuperación pendiente. El resto pasa a `legacy` |
| ZonePanel, tarjetas, Descubrir, ¿Y si se calienta?, contrastes, GT | **Retirar** | Mover a la rama `legacy-pulso-terrestre`; no borrar el historial |
| `stats.js` | **Ampliar** | Agregar `welch`, `tPval` (beta incompleta: `lgamma`, `betacf`, `ibeta`) y el manejo de `null` en `mean`/`sdv` |
| Plan fase 2: `giovanni_fetch.py`, parser GSOY | **Reutilizar** | Mismo enfoque, pero con **cajas de eventos** en vez de la grilla global (sección 3) |

**Componentes nuevos:**
- `SidePanel.vue` con tres pestañas: `Evento` · `Noticias` · `Simular`.
- `event/EventPanel.vue`: selector de evento, veredicto, 4 tarjetas de variable con minigráfica y la noticia destacada.
- `news/NewsPanel.vue`.
- `sim/SimPanel.vue`.
- `lib/event.js`, `lib/sim.js`.
- `data/news.js`, copiado del prototipo (`NEWS`).

---

## 3. Pipeline de datos

### 3.1 Configuración: `pipeline/events.yaml` (fuente única de verdad)
Para agregar un evento basta con agregar una entrada; no hay que tocar código.
```yaml
- id: rondonia
  type: deforestacion          # deforestacion | incendio | reforestacion
  name: Pico de deforestación en Rondônia
  place: Rondônia, Brasil
  year: 2004                   # año de inicio del evento
  skip: 0                      # años previos excluidos de la línea base (Australia: 1, por la sequía de 2019)
  center: [-10.8, -62.8]
  r: 2.2                       # caja: ±r° de latitud y ±r/cos(lat)° de longitud
  control:
    name: Amazonas, Brasil
    center: [-4.5, -65.0]
    why: "Bosque húmedo similar, sin deforestación grande en 2001–2024"
```
- Copia los 8 eventos del prototipo: centros, `r`, años y `skip`, y los controles de Rondônia y Kalimantan.
- **Controles faltantes:** propón 2–3 candidatos por evento. Elige con `check_controls.py` (sección 3.5), usando el mismo puntaje que `findControl` del prototipo:

  `|cobertura_pre_E − cobertura_pre_C| / 12 + |lluvia_E − lluvia_C| / lluvia_E / 0.35 + distancia_km / 2000`

  El control debe cumplir: a 250–2000 km del evento, cambio de cobertura en 2001–2024 menor a 1.5 puntos y sin solaparse con otros eventos.
- **Verifica con VCF real** que la caja del evento contiene la pérdida o la ganancia. Si no, ajusta el centro o `r` y anótalo en `DECISIONS.md`.

### 3.2 AppEEARS → vegetación y temperatura (`pipeline/appeears.py`)
1. Login con Earthdata Login (`.netrc` o variables de entorno, nunca en el repo) y consulta de la **lista de productos y capas por API** para confirmar los nombres. No adivines endpoints: sigue la documentación oficial de la API de AppEEARS.
2. **Envía todos los trabajos en la primera hora**: la cola de AppEEARS puede tardar horas. Haz una solicitud de **área** por caja (evento y control), con proyección geográfica, salida **NetCDF4** y período 2001-01-01 a 2024-12-31.
3. Script **idempotente**: guarda `task_id` por área en `pipeline/raw/appeears_tasks.json`, sondea el estado, descarga el bundle al terminar y no vuelve a pedir lo que ya existe.
4. Procesa cada área al terminar su descarga:
   - **VCF:**
     - Enmascara 200 (agua) y 253 (relleno); el valor válido va de 0 a 100.
     - Serie de la región = media de los píxeles válidos.
     - Comprueba la **convención de año** del producto (a qué período corresponde la fecha del granulo) y anótala en `DECISIONS.md`.
     - Si el último año no existe, ese año queda `null`.
   - **LST:**
     - `°C = valor × scale_factor − 273.15`; lee el factor del archivo.
     - Filtra con `QC_Day`: calidad obligatoria "buena" (bits 0–1 = 00). Si la cobertura queda por debajo del 40 %, acepta también 01 con error ≤ 2 K y documéntalo.
     - Para no sesgar por las nubes de la temporada lluviosa, calcula por píxel la **climatología mensual**. El valor anual es la climatología media + la media de las anomalías mensuales, con al menos 8 meses válidos.
   - **Salidas:**
     - Serie regional anual (24 valores o `null`) y el número de píxeles válidos.
     - Una **tesela de 0.1°** (promedio por bloques) con los valores anuales, para el globo.
5. Para revisar rápido, compara tu media regional con el CSV de estadísticas que AppEEARS entrega con cada solicitud de área. Debe coincidir en tendencia; puede diferir por el filtro de QC.

### 3.3 Giovanni → humedad y precipitación (`pipeline/giovanni_fetch.py`)
1. **Series por caja:** servicio *Time Series, Area-Averaged* para IMERG mensual y GLDAS mensual, sobre cada caja de evento y de control, 2001–2024, con descarga en CSV.
   - Son 16 cajas × 2 variables = **32 solicitudes**.
   - Si la URL de la solicitud es parametrizable, genéralas desde `events.yaml`. Si no, crea `docs/GIOVANNI_MANUAL.md` con los pasos para hacerlo a mano en paralelo.
2. **Mapas globales para el globo:** media anual de cada año (o animación con lista de NetCDF descargable, como en el plan de fase 2).
   - Regrid a **1°**; la humedad solo sobre tierra.
   - Si no da tiempo, el globo muestra solo las teselas regionales (ver el orden de recorte en la sección 7).
3. **Unidades:** leer siempre el atributo `units`.
   - IMERG suele venir en mm/h: pasar a mm/mes con los días de cada mes.
   - GLDAS viene en kg/m² para la capa de 10 cm: `m³/m³ = kg/m² / 100`.
   - Media anual con al menos 10 meses válidos.
4. Registra cada solicitud en `SOURCES.csv`: herramienta, producto, variable, caja, período, fecha y URL o ID.

### 3.4 Verificación independiente
- **CDO / GSOY** (`pipeline/stations.py`, reutiliza el parser de fase 2):
  - Estaciones dentro de cada caja + 100 km, con al menos 15 años válidos en 2001–2024 de `TAVG` o `PRCP`.
  - Descarta `PRCP` con código de fuente `S` y normaliza las unidades.
  - Las guarda en `events/{id}.json → stations`.
  - Con menos de 2 estaciones no se dice nada.
- **Hydrology Time Series:** serie de GLDAS `SoilMoi0_10cm` en el centro del evento y del control. Se compara con la serie de Giovanni de la caja (correlación y signo de la anomalía posterior al evento).

Los resultados de ambas verificaciones van a `docs/VALIDATION.md`. En la UI aparece como mucho **una línea** en la tarjeta de Temperatura o Precipitación, y solo si hay al menos 2 estaciones:
- "Las estaciones de NOAA en la zona coinciden (2 de 3)", o
- "Las estaciones de NOAA no confirman este cambio".

### 3.5 `pipeline/check_controls.py` y `pipeline/build_events.py`
- `check_controls.py` calcula el puntaje y los filtros de la sección 3.1 para cada candidato y elige el mejor. Imprime una tabla y **falla** si un evento no tiene un control válido.
- Otra comprobación de `check_controls.py`: la correlación de la lluvia anual evento–control en el período previo debería ser > 0.5. Si no, solo se emite una advertencia.
- `build_events.py` une todo en el contrato de la sección 4. **No calcula el análisis:** el análisis vive en un solo lugar, `web/src/lib/event.js`, para que no haya dos implementaciones que diverjan.
- Comando completo, que debe poder reanudarse:
  ```
  python appeears.py submit && python giovanni_fetch.py && python appeears.py fetch && python stations.py && python check_controls.py && python build_events.py && node ../web/scripts/validate.mjs
  ```

---

## 4. Contrato de datos (`web/public/data/`)

### `manifest.json`
```json
{
  "synthetic": false,
  "years": [2001, 2024],
  "variables": [
    { "id": "tree", "short": "Vegetación", "units": "%", "unitsCh": "puntos", "rel": false, "minsd": 0.6, "palette": "VEGDIV", "scale": 14,
      "source": { "tool": "AppEEARS", "product": "MOD44B.061", "layer": "Percent_Tree_Cover" } },
    { "id": "lst", "short": "Temperatura", "units": "°C", "unitsCh": "°C", "rel": false, "minsd": 0.12, "palette": "RdBu", "scale": 1.5, "source": { "...": "..." } },
    { "id": "sm", "short": "Humedad", "units": "m³/m³", "unitsCh": "m³/m³", "rel": false, "minsd": 0.004, "palette": "BrBG", "scale": 0.03, "source": { "...": "..." } },
    { "id": "precip", "short": "Precipitación", "units": "mm/mes", "unitsCh": "%", "rel": true, "minsd": 2.5, "palette": "BrBG", "scale": 25, "source": { "...": "..." } }
  ],
  "events": [
    { "id": "rondonia", "type": "deforestacion", "name": "…", "place": "…", "lat": -10.8, "lon": -62.8, "year": 2004, "skip": 0,
      "box": { "la0": -13.0, "la1": -8.6, "lo0": -65.04, "lo1": -60.56 },
      "ctrl": { "name": "Amazonas, Brasil", "box": { "...": "..." } },
      "series": "events/rondonia.json",
      "tiles": [ { "region": "event", "grid": { "res": 0.1, "lat0": -8.65, "lon0": -65.0, "nx": 45, "ny": 44 }, "files": { "tree": "tiles/rondonia_E_tree.bin", "lst": "tiles/rondonia_E_lst.bin" } },
                 { "region": "control", "grid": { "...": "..." }, "files": { "...": "..." } } ] }
  ],
  "global": [ { "var": "precip", "grid": { "res": 1, "lat0": 89.5, "lon0": -179.5, "nx": 360, "ny": 180 }, "file": "global/precip.bin", "scale": 0.1, "offset": 0 } ],
  "sources": [ { "var": "tree", "tool": "AppEEARS", "product": "MOD44B.061", "request": "task_id …", "downloaded": "2026-11-15" } ]
}
```
- `minsd` y `scale` son los valores del prototipo (`MINSD`, `scaleOf`).
- *(Agregado en H6)* Cada variable lleva `"synthetic": true|false`. El `synthetic` global es `true` mientras quede alguna variable simulada; la UI muestra cuál es real en el pie del panel. `ctrl` puede traer `status` (`prototipo` | `provisional`) y `why`, copiados de `events.yaml`.
- `rel: true` indica que la diferencia evento–control se calcula en %: `(E/C − 1) × 100`. En las demás variables se calcula como `E − C`.

### `events/{id}.json`
```json
{ "id": "rondonia",
  "series": { "tree":   { "event": [24 valores o null], "control": [24 valores o null], "n_event": 31500, "n_control": 29800 },
              "lst":    { "...": "..." }, "sm": { "...": "..." }, "precip": { "...": "..." } },
  "verify": { "gldas_precip": { "role": "verify_precip", "product": "GLDAS_NOAH025_M.2.1", "layer": "Rainf_f_tavg", "units": "mm/mes", "event": [24], "control": [24] },
              "gldas_skint":  { "role": "verify_lst", "...": "..." } },
  "stations": [ { "id": "…", "name": "…", "dist_km": 42, "inside": "event", "TAVG": [24], "PRCP": [24] } ] }
```
*(Agregado en H6)* `verify` es opcional; lo usa `web/scripts/validate.mjs`, no la UI.

### Binarios
- **Teselas y capa global:** Int16 little-endian, orden `[year][row][col]`, con `row` empezando en el norte.
  - Valor real = `int × scale + offset`; faltante = −32768.
  - `scale` y `offset` van por archivo en el manifest; elígelos para no saturar.
- **Valores absolutos anuales.** El cliente calcula la anomalía respecto a la línea base del evento elegido, igual que `cellAnom` del prototipo.
- **Tamaño objetivo:** ≤ 200 KB por tesela y ≤ 3.2 MB por capa global. Total de `public/data` < 15 MB, todo cargado de forma diferida.

---

## 5. Lógica en el cliente (`web/src/lib/`)

### 5.1 `event.js`: port exacto de `analyzeEvent` del prototipo
Para cada variable:
1. `te = year − 2001`. `pre = [max(0, te − 6), te − 1 − skip]`.
2. Diferencia `d[t]`: `E − C`, o `(E/C − 1) × 100` si `rel`.
3. `m0` = media de `pre`. `sd0 = max(minsd, sd(pre))`. Anomalía `a = d − m0`.
4. **Pico:** `kpk` = año con el mayor `|a|` desde `te`.
   - **Ventana de comparación:** 3 años alrededor del pico (`ps = max(te, min(kpk − 1, NT − 3))`). En reforestación, los últimos 4 años.
   - Welch entre `pre` y esa ventana.
5. **Aparición (`onset`):** primer año desde `te` con 2 años seguidos fuera de 2·sd0 en la dirección del pico.
6. **Cambio significativo:** `|peak| > 2·sd0` y (`p < 0.05` u `onset ≠ null`).
7. **Estados:**
   - `recovered`: tras el pico, 2 años seguidos dentro de ±sd0. Se guarda `rec` = años desde el evento.
   - `persistent`: el pico está en los últimos 3 años, o no hay tendencia de regreso.
   - `recovering`: pendiente de los últimos ≥ 4 años en dirección contraria al pico; `est = post + (|último| − sd0)/|pendiente|`, y si `est > 60` pasa a `persistent`.
   - Reforestación: `effect` si es significativo y `onset ≠ null`; si no, `noeffect`. Deforestación o incendio sin cambio significativo: `none`.
8. **`null`:** las funciones ignoran los años nulos.
   - Si en `pre` quedan menos de 2 valores válidos, la variable queda `insufficient` y la UI dice "Sin datos suficientes".
   - `NT` efectivo = último año con dato de esa variable.
9. **Tests** (`vitest`, `web/src/lib/event.test.js`): con `eventos_sinteticos_fixture.json`, para los 8 eventos × 4 variables:
   - `status`, `kpk`, `onset`, `rec` y `sig` deben coincidir exactamente;
   - `peak`, `sd0`, `est` y `end` dentro de 1e-4;
   - `p` dentro de 1e-5.

   Agrega además casos con 10–20 % de `null`.

### 5.2 `sim.js`: port de `empirical` + trayectoria de `renderSim`
- Regresión con retardo (0–4 años) de cada variable sobre la anomalía de vegetación, con todos los eventos analizados.
- Tasas de regeneración (mediana de las pendientes tras el pico en incendios) y de reforestación.
- **Test** contra `empirical` del fixture.
- Con datos reales, si `|r| < 0.3` la tarjeta dice "Relación débil: poco confiable" (ya está en el prototipo). **No ajustes umbrales para que se vea mejor.**

### 5.3 Textos
Porta `plainVar`, `headline`, `spark`, `statusBadge` y `YRS` tal cual. Los textos de la UI salen del prototipo; no inventes afirmaciones científicas.

---

## 6. Interfaz (debe verse como el prototipo)

- **TopBar:** marca, subtítulo y chips de las 4 variables. Badge "Demo · datos simulados" **solo** si `synthetic`.
- **Globo:**
  - Capa de la variable activa y marcadores de los eventos por tipo.
  - Caja del evento y caja de comparación con su etiqueta.
  - Botones de zoom. Pista: "Arrastra para girar · toca un evento para analizarlo".
  - Sin burbuja de modo.
  - Con vegetación o temperatura activas, fuera de las teselas solo se ve el mapa base. La leyenda agrega "Detalle disponible en las zonas de evento".
- **PlaybackControl:** ▶ Reproducir, slider 2001–2024, año y leyenda de color con los tipos de evento. **Sin texto explicativo debajo.**
- **Pestaña Evento:**
  - Selector de evento.
  - Veredicto en una línea (`headline`).
  - 4 tarjetas: Vegetación, Temperatura, Humedad y Precipitación, cada una con estado, cifra principal, frase y minigráfica con la franja de lo normal y la línea del año del evento.
  - Tarjeta "En las noticias" con la primera noticia y el botón "Ver N noticias sobre este evento".
  - **No hay** sección de detalle técnico.
- **Pestaña Noticias:**
  - Selector de evento y tarjetas con medio, fecha, idioma, título traducido, resumen propio de una línea y "Leer la noticia ↗" (con `target="_blank" rel="noopener"`).
  - Datos desde `data/news.js`.
  - `scripts/check-links.mjs` comprueba que cada enlace responda antes del deploy.
- **Pestaña Simular:**
  - Talar / Reforestar, slider de 5 a 40 puntos y, al talar, "Se deja regenerar" / "Se usa para cultivos o ganado".
  - 4 tarjetas de resultado.
  - **No hay** tarjeta de riesgos ni detalle de cómo se estima. Una sola línea al pie: "Estimación ilustrativa aprendida de N eventos reales".
- **Pie del panel:** fuente de la variable activa ("Fuente: MODIS VCF (MOD44B), vía AppEEARS").

**Calidad:**
- Sin errores de consola.
- Accesibilidad del plan original: `aria-selected` en las pestañas, foco visible, `prefers-reduced-motion`.
- ≥ 30 fps girando con la capa en caché.
- Funciona en móvil (el panel pasa debajo del globo).

---

## 7. Hitos (reemplazan H4–H8). T+0 = ahora

> **Primera acción (T+0, persona de datos):** enviar los trabajos de AppEEARS para las 16 áreas y lanzar las 32 series de Giovanni. Todo lo demás puede avanzar mientras se procesan.

**H4 · Reestructurar el frontend con mock (T+0 → T+6) · persona de frontend**
- `mock-verde.mjs` con el contrato nuevo.
- `field.js` generalizado; eventos y cajas en el globo; PlaybackControl.
- SidePanel con Evento, Noticias y Simular.
- Rama `legacy-pulso-terrestre` con lo retirado.
- ✅ La app con el mock se ve y se comporta como `prototipo-pulso-verde.html`, sin errores de consola.

**H5 · Lógica y tests (T+0 → T+5) · tercera persona, o la de frontend después de H4**
- `event.js`, `sim.js` y `stats.js` ampliado, con tests de referencia y de nulos.
- ✅ `npm test` pasa contra el fixture (8 eventos × 4 variables).

**H6 · Series reales por evento (T+0 → T+12) · persona de datos**
- `events.yaml`, `appeears.py`, `giovanni_fetch.py`, `check_controls.py`, `build_events.py`, `SOURCES.csv`.
- ✅ 8 eventos × 4 variables × 2 regiones con ≥ 20 años válidos; controles validados o justificados en `DECISIONS.md`.
- ✅ Con datos reales, el frontend carga sin cambios de código y el badge de simulado desaparece.

**H7 · Capas del globo + verificación (T+10 → T+18)**
- Teselas de 0.1° (vegetación y temperatura) y capas globales de 1° (precipitación y humedad).
- `stations.py` (CDO) y Hydrology Time Series.
- `validate.mjs`:
  - **Placebo temporal:** en los eventos con ≥ 10 años previos (Kalimantan 2015, Chiquitanía 2019, Australia 2020, Etiopía 2019), aplicar el análisis con años falsos (2008–2011) usando solo los datos anteriores al evento real.
  - **Sensibilidad:** línea base de 4 vs 6 años.
- Resultados en `docs/VALIDATION.md`.
- ✅ Los placebos marcan "cambio significativo" en ≤ 10 % de los casos. Si salen más, se reporta y se endurece el criterio **para todos los eventos por igual** (por ejemplo, exigir `p < 0.05` **y** `onset`), documentándolo.
- ✅ Las estaciones aparecen en la UI solo donde hay ≥ 2.

**H8 · Entrega (T+18 → final)**
- Deploy en Vercel o Netlify.
- README con la tabla de fuentes (herramienta, producto, capa, período, fecha, ID de solicitud), el método y las citas:
  - Welch 1947 y Benjamini & Hochberg 1995, si se usan;
  - Hansen/DiMiceli para MOD44B; Wan para MOD11;
  - Huffman para IMERG; Rodell para GLDAS;
  - Acker et al. (NTRS 20090042747).
- Capturas, guion de demo y pitch.
- ✅ URL pública funcionando en desktop y móvil; demo ensayada dos veces.

**Si falta tiempo, recortar en este orden:**
1. Capas globales de 1° (el globo muestra solo las teselas de las zonas de evento).
2. Hydrology Time Series.
3. Línea de estaciones en la UI (se mantienen en `VALIDATION.md`).
4. NDVI y área quemada.
5. Teselas de la región de control.

**Nunca se recortan:** las series reales de las 4 variables, los tests de `event.js` y las noticias.

---

## 8. Reparto sugerido (3 personas)

| Persona | Bloque |
|---|---|
| **Datos** | AppEEARS (T+0), Giovanni, controles, `build_events.py`; después, teselas y capas globales |
| **Frontend** | H4 (mock, globo, paneles); después, conectar datos reales, móvil, deploy |
| **Lógica + historia** | H5 (port + tests), noticias y verificador de enlaces, CDO y validación, README, guion y pitch |

Con 2 personas, la de frontend hace H5 justo después de H4, y la de datos se queda con CDO y la validación.

---

## 9. Riesgos conocidos y cómo tratarlos honestamente

| Riesgo | Qué hacer |
|---|---|
| Rondônia ya se deforestaba antes de 2004 y la línea base solo tiene 3 años (2001–2003) | Decirlo en la tarjeta del evento: "Línea base corta (3 años)". El piso `minsd` evita falsas alarmas |
| Etiopía (2019) tiene pocos años posteriores | Lo más probable es "Aún sin efecto claro". Es un resultado válido; no se fuerza |
| VCF subestima la cobertura en algunos biomas y su última versión puede no llegar a 2024 | Admitir `null` en 2024; nota de método en el README |
| La LST es de superficie, no del aire, y las estaciones miden el aire | Comparar solo la dirección del cambio; la UI nunca dice "temperatura del aire" |
| El control puede tener sus propios cambios | `check_controls.py` lo filtra; el criterio se documenta |
| Causalidad | Texto fijo en la pestaña Evento: "Asociación, no prueba de causa" |
| Tentación de ajustar umbrales para que "salga bonito" | Prohibido. Cualquier cambio de criterio se aplica a todos los eventos y queda en `DECISIONS.md` con su razón |

---

## 10. Reglas para Claude Code (además de las de los planes anteriores)

1. Solo las 5 fuentes de la sección 1. Si algo solo existe por otra vía, márcalo como `TODO(fuente no permitida)` y pregunta.
2. **No inventes** nombres de productos, capas ni endpoints. Verifícalos en la herramienta o en su documentación oficial; si no puedes, márcalo como `TODO(verificar)`.
3. Prueba siempre con **un evento y una variable** antes de lanzarlo todo. Avisa si alguna descarga supera 2 GB.
4. Lee las unidades, los factores de escala y los valores de relleno **desde los archivos**.
5. El análisis estadístico vive solo en `web/src/lib/event.js`, con sus tests. No lo dupliques en Python.
6. Mantén `mock-verde.mjs` funcionando con el contrato. Si el contrato cambia, actualiza este documento, el mock y el loader en el mismo commit.
7. Un commit por hito o subhito, con mensajes claros. No marques un hito como terminado con tests fallando.
