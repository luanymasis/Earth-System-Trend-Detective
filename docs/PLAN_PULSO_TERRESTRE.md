# Pulso Terrestre: plan de implementación para Claude Code

> **Para Claude Code:** este documento es la especificación completa del proyecto. Léelo entero antes de empezar. Trabaja por hitos (sección 10), en orden, y no avances al siguiente hito sin cumplir sus criterios de aceptación. Junto a este archivo hay un prototipo funcional (`prototipo-referencia.html`) con toda la lógica en JavaScript. **Porta su lógica en lugar de reinventarla.** Las funciones a reutilizar se nombran en cada sección.

---

## 0. Contexto

Es un proyecto para un hackathon (NASA Space Apps Challenge). Tenemos **48 horas** y un equipo de **2–3 desarrolladores**.

**Enunciado del challenge (resumen):** crear una herramienta que permita **seleccionar variables** de misiones o modelos de ciencias de la Tierra, **visualizar cómo cambian en el tiempo** y determinar **qué cambia, dónde, cuánto y si el cambio es estadísticamente significativo**. El enunciado subraya que una misma variable puede subir en una región y bajar en otra aunque el proceso que la impulsa sea el mismo.

**Nuestra propuesta:** un globo terráqueo interactivo, amigable para cualquier persona, con rigor estadístico visible si se busca. Tiene cuatro modos (Comparar años, Tendencia, Proyección, ¿Y si se calienta?), un panel de zona y un modo Descubrir.

**Principios de producto (no negociables):**
1. **Lenguaje cotidiano primero.** Nada de p-valores en la vista principal: "Confianza: Muy seguro" y "¿Podría ser casualidad? Menos de 1 en 1,000".
2. **Honestidad estadística.** Corrección FDR en el mapa, pre-blanqueo por autocorrelación, rangos de incertidumbre, y nunca afirmar causalidad.
3. **Las proyecciones se etiquetan como "proyección estadística de la tendencia, no un modelo climático"** y se validan contra el pasado.
4. **Interfaz limpia.** Un solo control de modo, una sola barra de controles y un panel con dos pestañas.

---

## 1. Stack y decisiones

| Área | Decisión |
|---|---|
| Pipeline de datos | Python 3.11+, `earthaccess`, `xarray`, `netCDF4`, `numpy`, `scipy`, `pymannkendall` (solo para tests), `geopandas` + Natural Earth (máscara y nombres), `pytest` |
| Frontend | **Vue 3 + Vite**, JavaScript (no TypeScript, por velocidad), **Pinia** para el estado, `d3` (v7) y `topojson-client`, `world-atlas` (countries-110m y 50m) |
| Hosting | **Estático** en Vercel o Netlify. Sin backend: todo lo pesado se precalcula en el pipeline y se sirve desde `web/public/data/` |
| Idioma | UI en **español**; código, nombres de variables y comentarios técnicos en inglés |
| Grilla | **2° × 2°** (180 × 90 celdas), años **2001–2024** (24 años), resolución anual |

---

## 2. Estructura del repositorio

```
pulso-terrestre/
├── README.md                 # qué es, cómo correrlo, datasets de NASA usados (con enlaces), método
├── pipeline/
│   ├── pyproject.toml / requirements.txt
│   ├── config.py             # catálogo de variables (sección 3), grilla, años
│   ├── download.py           # earthaccess: búsqueda + descarga (con subset de variables cuando se pueda)
│   ├── build_cube.py         # medias anuales → regrid a 2° → máscaras → cubo [var, year, lat, lon]
│   ├── stats.py              # MK + TFPW + Sen + FDR vectorizados; sensibilidad a temperatura global
│   ├── discover.py           # ranking de cambios + contrastes → discover.json
│   ├── names.py              # nombre legible para un punto (lugar conocido / país / océano)
│   ├── export.py             # escribe manifest.json, {var}.bin, {var}_stats.bin, discover.json
│   ├── validate.py           # prueba nula, hindcast global, reporte en consola
│   ├── mock.py               # genera datos sintéticos con el MISMO formato (porta el motor del prototipo)
│   └── tests/
│       └── test_stats.py
└── web/
    ├── index.html
    ├── vite.config.js
    ├── public/data/          # salida del pipeline (o del mock)
    └── src/
        ├── main.js
        ├── App.vue
        ├── stores/app.js     # Pinia
        ├── lib/
        │   ├── loader.js     # lee manifest y .bin (lazy por variable)
        │   ├── stats.js      # sen, mk, trendStats, threshold (FDR): portados del prototipo
        │   ├── zone.js       # zoneStats(var, zone): serie regional ponderada + estadísticos
        │   ├── forecast.js   # fitLine, predict, hindcast, timeToDetect
        │   ├── whatif.js     # regressGT, xLevel
        │   ├── colors.js     # paletas por variable + LUT
        │   ├── format.js     # números, signos, textos amigables
        │   └── names.js      # nameAt(lat, lon) en cliente (para clics libres)
        ├── globe/
        │   ├── renderer.js   # d3.geoOrthographic + capa raster de datos (ver sección 7.2)
        │   ├── field.js      # campo normalizado por celda y suavizado 3×3
        │   ├── interaction.js# arrastrar, zoom, pellizco, clic, vuelo animado
        │   └── layer.worker.js (opcional, hito 7)
        └── components/
            ├── TopBar.vue
            ├── ModeSwitch.vue
            ├── GlobeCanvas.vue
            ├── ControlBar.vue          # muestra el subcontrol del modo activo
            ├── controls/CompareControl.vue, TrendControl.vue, ForecastControl.vue, WhatIfControl.vue
            ├── SidePanel.vue           # pestañas "Esta zona" / "Descubrir"
            ├── zone/ZonePanel.vue, WhatIfPanel.vue
            ├── zone/cards/ForecastCard.vue, EmergenceCard.vue, ContrastCard.vue, CoChangeCard.vue, ZoneChart.vue
            └── discover/DiscoverPanel.vue
```

---

## 3. Catálogo de variables (`pipeline/config.py` y el manifest)

> **Verifica cada short name y nombre de variable en Earthdata Search (https://search.earthdata.nasa.gov) antes de descargar.** Si alguno no existe o cambió, busca el equivalente y anótalo en el README. No inventes nombres.

| id | Nombre UI | Pregunta | Producto | Variable en el archivo | Unidades UI | Dominio | Paleta | Modo de cambio |
|---|---|---|---|---|---|---|---|---|
| `precip` | Lluvia | ¿Está lloviendo más o menos? | MERRA-2 `M2TMNXFLX` | `PRECTOT` (kg m⁻² s⁻¹ → mm/mes) | mm/mes | all | BrBG | pct |
| `t2m` | Temperatura | ¿Hace más calor que antes? | MERRA-2 `M2TMNXSLV` | `T2M` (K → °C) | °C | land | RdBu | abs |
| `aod` | Partículas en el aire | ¿El aire está más limpio? | MERRA-2 `M2TMNXAER` | `TOTEXTTAU` | AOD | all | GnPi | pct |
| `snow` | Nieve | ¿Hay menos nieve? | MERRA-2 `M2TMNXLND` | `FRSNO` (fracción → %) | % de cobertura | land, lat > 30° | PuOr | pct |
| `sm` | Humedad del suelo | ¿Se está secando el suelo? | GLDAS `GLDAS_NOAH10_M` | `SoilMoi0_10cm_inst` (kg m⁻² → m³/m³ dividiendo por 100) | m³/m³ | land (sin Antártida ni Groenlandia) | BrBG | pct |
| `sst` *(extra)* | Mar | ¿Se está calentando el mar? | MERRA-2 `M2TMNXSLV` `TS` sobre océano, o un producto satelital de SST | `TS` (K → °C) | °C | ocean | RdBu | abs |
| `ndvi` *(extra satelital)* | Vegetación | ¿Hay más o menos vegetación? | MODIS `MOD13C2` vía OPeNDAP/Giovanni, o GPM IMERG `GPM_3IMERGM` como 2.º satelital | NDVI | NDVI | land | BrBG | pct |

Textos amigables por variable (van en el manifest; copia los del prototipo):
- `up` / `down`: "llueve más" / "llueve menos", "hace más calor" / "hace menos calor", "hay más nieve" / "hay menos nieve", "el aire está más limpio" (down de AOD) / "hay más partículas en el aire" (up), etc.
- `low` / `high` para la leyenda: "Menos lluvia" / "Más lluvia", "Más frío" / "Más calor", etc.
- `noun`: "la lluvia", "la temperatura", "la nieve"…
- `vmax`: escala de color en unidades por década (precip 6, t2m 0.8, sst 0.5, snow 6, ndvi 0.03, sm 0.012, aod 0.05). **Recalibrar con los datos reales:** usa el percentil 95 de |Sen| entre las celdas significativas.

**Indispensable:** `precip`, `t2m` y una tercera (`aod` o `sm`). Las demás, por orden: `snow`, `sm`/`aod`, `sst`, `ndvi`.

---

## 4. Pipeline de datos

### 4.1 `download.py`
- `earthaccess.login()` (estrategia `netrc` o variables de entorno; documentarlo en el README).
- `earthaccess.search_data(short_name=..., temporal=("2001-01-01", "2024-12-31"))` y luego `earthaccess.download(..., local_path="pipeline/raw/{id}/")`.
- Si el producto ofrece OPeNDAP, preferir el subset de la variable necesaria (los archivos MERRA-2 completos traen muchas variables).
- Debe poder reanudarse: saltar los archivos ya descargados.
- **Lanzar las descargas al inicio del hackathon: es la tarea más lenta.**

### 4.2 `build_cube.py`
1. Abrir con `xr.open_mfdataset` y convertir unidades (tabla de la sección 3).
2. **Media anual** por celda (`resample(time="YS").mean()`), con al menos 10 meses válidos por año; si no, NaN.
3. **Regrid a 2°** con promedio por bloques ponderado por área (`coarsen` si la grilla lo permite; si no, `xesmf` conservativo o interpolación bilineal como último recurso).
4. **Máscaras** (Natural Earth 110m vía `geopandas` o `regionmask`): `land_any` (alguna parte de la celda es tierra), `ocean_any`, Groenlandia y Antártida. Aplicar el dominio de cada variable.
5. Guardar `cube.nc` con dimensiones `[var, year, lat, lon]` (lat de 89 a −89, lon de −179 a 179, centros de celda).

### 4.3 `stats.py` (vectorizado con numpy sobre todas las celdas)
Las mismas fórmulas que el prototipo (`trendStats`, `sen`, `mk`, `threshold`):

- **Pendiente de Sen:** mediana de `(y[j]-y[i])/(j-i)` para i<j. Con n=24 son 276 pares.
- **Pre-blanqueo TFPW (Yue et al. 2002):**
  1. `b` = Sen.
  2. Serie sin tendencia: `D[t] = y[t] - b*t`.
  3. `r1` = autocorrelación lag-1 de D.
  4. Si `r1 > 0`: `Y'[t] = D[t] - r1*D[t-1] + b*t` para t ≥ 1 (n-1 valores).
  5. Mann-Kendall sobre `Y'`.
- **Mann-Kendall:** `S = Σ sign(y[j]-y[i])`; `Var(S) = n(n-1)(2n+5)/18` (sin corrección por empates en el MVP); `Z = (S-1)/√Var` si S>0, `(S+1)/√Var` si S<0, 0 si S=0; `p = 2(1-Φ(|Z|))`; `τ = S / (n(n-1)/2)`.
- **FDR Benjamini-Hochberg** sobre todas las celdas válidas de cada variable (α = 0.05): ordenar los p de menor a mayor y tomar el mayor `p_(k)` tal que `p_(k) ≤ k/m·α`; esa celda y todas las de p menor son significativas.
- **Temperatura global anual `GT[t]`:** media ponderada por cos(lat) de la anomalía de `t2m` (tierra) y `sst` (océano). Si no hay `sst`, usar `t2m` global o MERRA-2 `TS` global. `GT_OBS` = pendiente de Sen de GT × 23 (calentamiento observado en el período).
- **Sensibilidad al calentamiento (pattern scaling):** por celda, regresión OLS `y ~ GT`. Se guarda `b` (unidades por °C) y su `p`, con el error estándar inflado por `√((1+φ)/(1-φ))`, donde φ es el lag-1 de los residuos (acotado a [0, 0.9]). FDR igual que arriba.
- Salida por variable: `sen_per_decade`, `p_trend`, `sig_trend` (bool, FDR), `sens_b`, `p_sens`, `sig_sens`, `mean` (2001–2024).

### 4.4 `tests/test_stats.py`
- Para 50 celdas al azar, `stats.py` debe coincidir con `pymannkendall.trend_free_pre_whitening_modification_test` y `sens_slope` (tolerancia 1e-6 en Sen; diferencias pequeñas en p son aceptables si la decisión al 5 % coincide; documentarlas).
- Serie con tendencia perfecta: p < 0.001. Ruido blanco: p uniforme (prueba con 1000 series, ~5 % < 0.05).
- FDR: caso de juguete con p conocidos.

### 4.5 `discover.py`
Reproduce `discFor`, `topChanges`, `topContrasts` y `nearestContrast` del prototipo:
- Regiones candidatas: centros cada 8° en latitud (−50 a 75) y 8°/cos(lat) en longitud, más una lista de lugares conocidos (copiar `PLACES` del prototipo: Guanacaste, Corredor Seco, Sahel, Alpes, Siberia, Pekín, Nueva Delhi, Amazonía, etc.).
- Región = caja de ±4° de latitud y ±4°/cos(lat) de longitud; serie = media ponderada por cos(lat) de las celdas válidas (mínimo 4 celdas).
- Estadísticos de la serie regional y nivel de confianza: `p<0.01 → 4 "Muy seguro"`, `<0.05 → 3 "Seguro"`, `<0.1 → 2 "Posible"`, otro → `1 "Sin evidencia clara"`.
- **Mayores cambios:** regiones con nivel ≥ 3, ordenadas por `|Sen×10|/vmax`, sin repetir la misma variable a menos de 2,500 km. Top 10 por variable y top 10 global.
- **Contrastes:** pares de la misma variable con nivel ≥ 3, signos opuestos y distancia entre 600 y 3,500 km, ordenados por `min(magnitud)`, sin pares solapados (< 2,000 km de otro ya elegido). Top 6.
- Nombre de cada región con `names.py`: lugar conocido a menos de 420 km → país (Natural Earth, nombre en español) → nombre de océano (reglas de `oceanName` del prototipo).

### 4.6 `export.py`: formato de datos (contrato con el frontend)

`web/public/data/manifest.json`:
```json
{
  "grid": { "res": 2, "nx": 180, "ny": 90, "lat0": 89, "lon0": -179 },
  "years": [2001, 2024],
  "gt": { "series": [/* 24 floats */], "obs_warming": 0.45 },
  "variables": [
    {
      "id": "precip", "short": "Lluvia", "q": "¿Está lloviendo más o menos?",
      "noun": "la lluvia", "up": "llueve más", "down": "llueve menos",
      "low": "Menos lluvia", "high": "Más lluvia",
      "units": "mm/mes", "mode": "pct", "fdec": 0, "dec": 2,
      "domain": "all", "palette": "BrBG", "vmax": 6,
      "product": "MERRA-2 M2TMNXFLX", "source": "Reanálisis", "doi_or_url": "...",
      "data": "precip.bin", "stats": "precip_stats.bin",
      "scale": 0.01, "offset": 0
    }
  ]
}
```
- `{id}.bin`: **Int16 little-endian**, orden `[cell][year]` (cell = i*nx + j, i desde el norte), valor real = `int*scale + offset`, faltante = −32768. Elegir `scale` para no saturar (rango Int16).
- `{id}_stats.bin`: Float32 little-endian, 6 bloques consecutivos de `nx*ny`: `sen_per_decade, p_trend, sig_trend(0/1), sens_b, p_sens, sig_sens(0/1)`.
- `discover.json`: `{ "changes": [...], "contrasts": [...] }` con `var`, `lat`, `lon`, `name`, `level`, `pct`/`total`, `sen_per_decade`, `distance_km` (en contrastes).
- Objetivo de tamaño: < 1 MB por variable sin comprimir.

### 4.7 `mock.py`
Porta el motor sintético del prototipo (variables `VARS`, `makeSmooth`, campos anuales espacialmente coherentes `YF`, ruido AR(1)) a Python, y genera **exactamente** los mismos archivos que `export.py`. Así el frontend se desarrolla sin esperar los datos reales. El manifest debe incluir `"synthetic": true`, y la UI muestra el aviso "Demo · datos simulados" solo en ese caso.

### 4.8 `validate.py`
Imprime un reporte:
- **Prueba nula:** con los años barajados al azar en todas las celdas, el % de celdas significativas tras FDR (debe ser ≤ 1 %) y sin corrección (≈ 5 %).
- **Hindcast global:** para las regiones de `discover`, entrenar con 2001–2019, predecir 2020–2024 y reportar la cobertura del intervalo del 80 % (ideal ≈ 80 %) y la mejora del error frente a la climatología.

---

## 5. Lógica en el cliente (`web/src/lib/`)

Portar del prototipo y mantener las firmas:

- **`zone.js`, `zoneStats(variable, zone)`:** caja de ±4° de latitud y ±4°/cos(lat) de longitud alrededor del punto; serie anual = media ponderada por cos(lat) de `base + anomalía` (en datos reales, el valor absoluto directamente); `trendStats` con TFPW; Sen e intercepto mediano (`icpt = mediana(y[t] - b*t)`); `start = icpt`, `end = icpt + b*(n-1)`, `pct = (end-start)/|start|·100`; nivel 1–4; `toe = timeToDetect`. Memoizar por `var|lat|lon`.
- **Comparar años:** promedio de 3 años centrado (`mean3`) en el año A menos el del año B. En el mapa, por celda; en el panel, sobre la serie regional.
- **`forecast.js`:**
  - `fitLine(y)` → `{slope, icpt, sd (residual), phi (lag-1 acotado a [0, 0.9]), sig (p<0.05), mean}`.
  - `predict(F, t)`: con tendencia significativa, `m = icpt + slope·t` y `sd² = σ²(1 + infl/n) + (t - t̄)²·σ²/Sxx·infl`, con `infl = (1+φ)/(1-φ)` y `Sxx = n(n²-1)/12`. Sin tendencia, `m = mean` y `sd² = σ²(1 + infl/n)`. Rango del 80 %: `m ± 1.28·sd`.
  - `hindcast(y)`: entrena con los primeros n-5 años y predice los 5 últimos; devuelve `inside/5` y `gain = 1 - MAE_modelo/MAE_climatología`.
  - Probabilidad de que el próximo año esté por encima o por debajo de lo normal: `1 - Φ((mean - m)/sd)`.
  - **`timeToDetect` (Weatherhead et al. 1998):** `n* = [3.3·σ/|ω| · √((1+φ)/(1-φ))]^(2/3)`, con ω = pendiente por año.
- **`whatif.js`:** `regressGT(y)` sobre la serie regional (misma fórmula que el pipeline). `xLevel(X)`: `X ≤ 1.05·GT_OBS` → "Dentro de lo observado" (#606c38); `≤ 2.5·GT_OBS` → "Extrapolación moderada" (#dda15e); más → "Especulativo" (#bc6c25). El rango se ensancha ×1, ×1.5 o ×2.2 según el nivel.
- **Cambia junto con:** las demás variables con nivel ≥ 3 en la misma zona. Texto fijo: "Cambian al mismo tiempo en esta zona. Es una asociación, no prueba que una cause a la otra."
- **Contraste cercano:** desde `discover.json` (o calculado en el cliente si la zona es libre), la región más cercana de la misma variable con nivel ≥ 3 y signo opuesto, a entre 400 y 4,000 km.

---

## 6. Diseño visual

### 6.1 Paleta de la interfaz (del usuario)
```
--bg:#fefae0  --surface:#fffdf5  --raised:#f5efd6  --line:#e3dbba
--ink:#283618 (texto)  --muted:#6b6f52  --accent:#606c38  --deep:#283618
--tan:#dda15e  --brown:#bc6c25 (botones de acción, marcador de zona)
```
Tipografías (Google Fonts): **Sora** (títulos) y **Figtree** (texto).

### 6.2 Paletas del globo (semánticas por variable, NO usar la paleta de la UI aquí)
El valor normalizado `x ∈ [-1, 1]` (positivo = aumenta) se mapea a `t = (x+1)/2`:
```
BrBG (lluvia, vegetación, humedad): #8c510a #d8b365 #f6e8c3 #f5f5f5 #c7eae5 #5ab4ac #01665e
RdBu (temperatura, mar):            #2166ac #67a9cf #d1e5f0 #f7f7f7 #fddbc7 #ef8a62 #b2182b
PuOr (nieve):                       #b35806 #f1a340 #fee0b6 #f7f7f7 #d8daeb #998ec3 #542788
GnPi (partículas):                  #4d9221 #a1d76a #e6f5d0 #f7f7f7 #fde0ef #e9a3c9 #c51b7d
```
Las flechas ▲▼ del panel usan el color del extremo correspondiente (t = 0.975 / 0.025).

### 6.3 Globo
- Fondo del escenario: radial `#fffbe8 → #efe8c9`. Océano: radial `#b9cbc3 → #7f998f`. Tierra: `#f3eed6`. Fronteras: `rgba(96,108,56,.4)`. Costa: `rgba(40,54,24,.65)`. Retícula: `rgba(40,54,24,.08)`. Halo y sombreado esférico como en el prototipo.
- Zona seleccionada: caja punteada `#bc6c25` con pulso; zona de contraste en `#606c38`; etiquetas con contorno crema.

---

## 7. Frontend: comportamiento detallado

### 7.1 Layout
- **TopBar:** marca "Pulso Terrestre" y chips de variables (`short`). Chip activo en `--deep` con texto crema.
- **Principal:** globo (columna flexible) | panel lateral de 410 px. En móvil (< 960 px) se apilan: globo a 64vh y el panel debajo.
- Sobre el globo, arriba al centro: **ModeSwitch** (Comparar años · Tendencia · Proyección · ¿Y si se calienta?). Arriba a la derecha: zoom +/−. Arriba a la izquierda: "Arrastra para girar · toca una zona".
- Abajo, flotante: **ControlBar** con el control del modo, la leyenda (gradiente con `low`/`high`) y una nota de una línea.

### 7.2 Renderer del globo (`globe/renderer.js`, portar `draw` y `renderLayer` del prototipo)
1. `d3.geoOrthographic().rotate([-lon0, -lat0]).scale(R0*zoom).clipAngle(90)` dibujando en un `<canvas>` con devicePixelRatio.
2. Orden de capas: halo → océano (esfera) → retícula → tierra → **capa de datos** → fronteras → costa → sombreado → marcadores.
3. **Capa de datos:** canvas fuera de pantalla a escala 0.5. Para cada píxel dentro del disco, proyección ortográfica inversa analítica → (lat, lon) → **muestreo bilineal** del campo suavizado (`BV` valor, `BA` visibilidad) → LUT de color (256 entradas). La opacidad depende del modo:
   - En Comparar, transparente si `|x| < 0.08`, con rampa hasta 0.48.
   - En los demás modos, `0.5 + 0.6|x|`.
4. **Recorte por dominio:** `land` → clip a la tierra; `ocean` → esfera + tierra con `evenodd`; `all` → esfera.
5. **Caché:** recalcular la capa solo si cambia `fieldKey` (variable, modo, años, X, H) o la vista (lon0, lat0, zoom, tamaño). El pulso del marcador solo redibuja los vectores.
6. Geometría: 110m con zoom < 2 y 50m con zoom ≥ 2.

### 7.3 Interacción (portar)
Arrastrar para rotar (latitud acotada a ±80°), rueda o pellizco para el zoom (0.8–8), clic sin arrastre para `unproject` → seleccionar zona y volar (easing de 1.1 s). Al inicio, rotación lenta automática hasta la primera interacción. Respetar `prefers-reduced-motion`.

### 7.4 Modos
| Modo | Control | Valor por celda (x) | Escala |
|---|---|---|---|
| **Comparar años** | "Comparar [año A] con [año B]" (selects; A > B) + "▶ Ver cómo cambió" (anima A desde B+1 hasta A, interpolando, a ~2.2 años/s) | `mean3(A) - mean3(B)` | `vmax·2` |
| **Tendencia** | Texto "Cambio sostenido 2001–2024" | Sen/década si `sig_trend`; si no, transparente | `vmax` |
| **Proyección** | "Si la tendencia continúa, así estaría en [2026/2030/2035] comparado con lo normal" | `sen/10 · (H - 2012.5)` si es significativo | `vmax/10·(H-2012.5)` |
| **¿Y si se calienta?** | Slider 0–4 °C (paso 0.1), con la pista coloreada por zonas de confianza, botones +0.5/+1/+2/+3 (animación de 0.9 s), etiqueta de confianza y leyenda de las 3 zonas | `sens_b · X` si `sig_sens` | `vmax·2.5` |

Notas fijas de la ControlBar:
- **Comparar:** "Cada año es el promedio de 3 años a su alrededor, para no confundir un año raro con un cambio. Sin color: diferencia pequeña."
- **Proyección:** "Proyección estadística de la tendencia observada, no un modelo climático."
- **¿Y si?:** "Cada zona se mueve según cómo respondió a cada décima de grado de calentamiento global entre 2001 y 2024 (pattern scaling). No es un modelo climático y no incluye puntos de quiebre."

Tooltip al pasar el mouse: el valor de la celda según el modo + "Toca para ver la zona".

### 7.5 Panel "Esta zona"
Orden:
1. `k` = variable; título = nombre de la zona.
2. **Titular:**
   - Nivel ≥ 3: "Aquí **{up/down}** que en 2001."
   - Nivel 2: "Posiblemente {…}, pero aún no es seguro."
   - Nivel 1: "No hay un cambio claro en {noun}."
3. Píldora "Confianza: {nivel}".
4. Tres datos: "{A} vs {B}" (con promedios de 3 años), "Por década", "¿Casualidad?" (`< 1 en 1,000` / `1 en N` / `N %`).
5. "▸ Ver gráfico con proyección" (colapsable): serie observada, años comparados resaltados, proyección punteada y banda del 80 % hasta H.
6. **Tarjeta Proyección:** valor en H con rango, probabilidad para el próximo año (mostrar "más de 99 %" si p > 0.99) y la etiqueta verde "✓ Probado con el pasado: k de 5 años (2020–2024) cayeron dentro del rango · N % más preciso que suponer 'año normal'" (la segunda parte solo si la mejora > 5 %).
7. **¿Cuándo lo sabremos?** (solo si el nivel ≤ 2): si n* > 100, "en la práctica no está cambiando"; si n* ≤ n, "uno o dos años más deberían bastar"; si no, "harían falta X años más (hacia AAAA)". Citar Weatherhead et al. 1998.
8. **Contraste cercano** (solo si el nivel ≥ 3): "A N km, en {lugar}, ocurre lo contrario…" + botón "Ver ambos en el globo" (vuela al punto medio con un zoom según la distancia y marca las dos zonas).
9. **Cambia junto con.**

En el modo ¿Y si se calienta?, el panel cambia a **WhatIfPanel**: titular "Con +X °C, aquí {up/down}: {noun} cambiaría {±N}" + rango, lista "Todo lo que cambiaría aquí" (7 variables con su rango), "Sensibilidad observada" (cambio por cada +0.1 °C global) y "Cómo leer esta simulación".

Sin datos para la variable: un mensaje contextual ("Aquí no nieva…", "Está lejos del mar…").

### 7.6 Panel "Descubrir"
Encabezado "¿Qué está cambiando más en el planeta?" + "Revisamos N variables en M regiones". Filtros: chips "Mayores cambios" | "Contrastes" y un select de variable ("Todas las variables"). Tarjetas clicables que cambian la variable, seleccionan la zona y vuelan a ella. En los contrastes, el par se muestra como "▲ A vs ▼ B · N km" y se marcan ambas zonas.

### 7.7 Estado (Pinia `stores/app.js`)
`variableId, mode ('compare'|'trend'|'forecast'|'whatif'), yearA, yearB, yearAf (animación), horizon (2030), warming X, zone {lat, lon, name}, otherZone, tab ('zone'|'disc'), discoverFilter, discoverVar, showChart, view {lon0, lat0, zoom}`.

---

## 8. Calidad
- Accesibilidad: foco visible, botones con `aria-pressed`/`aria-selected`, `aria-label` en el canvas, contraste ≥ 4.5:1, direcciones con ▲▼ además del color, `prefers-reduced-motion`.
- Rendimiento: con la capa en caché, girar a ≥ 30 fps en una laptop media. Si no se alcanza, mover `renderLayer` a un Web Worker con `OffscreenCanvas` (hito 7).
- Sin errores en la consola durante el flujo de la demo.
- `npm run build` sin advertencias críticas; tamaño total de `public/data` < 10 MB.

---

## 9. Despliegue
- Vercel (o Netlify) apuntando a `web/`, con build `npm run build` y salida `dist`.
- El README incluye: cómo correr el pipeline (`python download.py && python build_cube.py && python stats.py && python discover.py && python export.py && python validate.py`), cómo usar el mock (`python mock.py`), la lista de datasets con enlaces y DOI, y el método con citas: Mann 1945, Kendall 1975, Sen 1968, Yue et al. 2002, Benjamini & Hochberg 1995, Wilks 2016, Weatherhead et al. 1998, y Tebaldi & Arblaster 2014 (pattern scaling).

---

## 10. Hitos (en orden; cada uno termina con un commit)

**H1: Esqueleto + mock (horas 0–3)**
- Repo con `pipeline/` y `web/`; Vite + Vue 3 + Pinia; `mock.py` genera `public/data/` con el formato de la sección 4.6.
- ✅ `npm run dev` muestra la TopBar y el panel vacío; `loader.js` lee el manifest y una variable.

**H2: Globo (horas 3–10)**
- `renderer.js`, `field.js` e `interaction.js` portados; modo Tendencia y Comparar con datos mock.
- ✅ Girar, hacer zoom y seleccionar una zona funciona; la capa se recorta por dominio; la leyenda es correcta.

**H3: Panel de zona (horas 6–14, en paralelo con H2)**
- `zone.js`, `forecast.js`, ZonePanel y las tarjetas (Proyección, ¿Cuándo lo sabremos?, Cambia junto con).
- ✅ Para Guanacaste en el mock, los números coinciden con el prototipo (±1 %).

**H4: Pipeline real (horas 0–20, persona de datos)**
- `download.py`, `build_cube.py`, `stats.py` + tests, `export.py` para 3 variables.
- ✅ `pytest` pasa; el frontend carga los datos reales sin cambios de código.

**H5: Descubrir + contrastes (horas 20–28)**
- `discover.py` + `names.py` → `discover.json`; DiscoverPanel; "Ver ambos en el globo".
- ✅ Hay al menos 3 contrastes reales con nombres legibles en español.

**H6: ¿Y si se calienta? + Proyección en el globo (horas 20–30)**
- GT y sensibilidades en el pipeline; WhatIfControl y WhatIfPanel; modo Proyección.
- ✅ La pista del slider muestra las 3 zonas según `GT_OBS` real; el rango se ensancha al extrapolar.

**H7: Pulido (horas 28–38)**
- Móvil, accesibilidad, Web Worker si hace falta, variables extra (snow, sm, sst, ndvi en ese orden), `validate.py`.
- ✅ La prueba nula da ≤ 1 % con FDR; criterios de la sección 8 cumplidos.

**H8: Entrega (horas 38–48)**
- Deploy, README, capturas, aviso "datos simulados" solo con el mock.
- ✅ La URL pública funciona en desktop y móvil.

**Si falta tiempo, recortar en este orden:** ndvi → sst → Web Worker → modo Proyección en el globo → animación "Ver cómo cambió" → snow.

---

## 11. Reglas para Claude Code
1. **No inventes nombres de datasets, variables ni URLs.** Verifícalos (Earthdata Search o la documentación de GES DISC) y, si no puedes, déjalo marcado como `TODO(verificar)`.
2. Avísame antes de descargas grandes (> 2 GB) y propón un subset.
3. Mantén el contrato de datos de la sección 4.6. Si necesitas cambiarlo, actualiza este documento y el mock a la vez.
4. Cada función estadística lleva su test. No marques un hito como terminado con tests fallando.
5. Textos de la UI en español, tal como aparecen aquí y en el prototipo. No inventes afirmaciones científicas nuevas.
6. Commits pequeños por hito, con mensajes claros.
7. Ante una decisión de diseño no cubierta aquí, elige lo más simple que cumpla los principios de la sección 0 y anótala en `DECISIONS.md`.
