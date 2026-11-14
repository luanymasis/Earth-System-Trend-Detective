# Pulso Terrestre: Fase 2, datos reales con las fuentes permitidas

> **Para Claude Code:** este documento **complementa y reemplaza en parte** a `PLAN_PULSO_TERRESTRE.md`. Los hitos H1–H3 ya están terminados (esqueleto + mock, globo, panel de zona). A partir de aquí:
> - Las **secciones 3 (catálogo), 4.1–4.2 (descarga y cubo) y 10 (hitos H4–H8)** del plan original quedan **reemplazadas** por este documento.
> - El resto del plan original sigue vigente: principios, stack, estadísticas (4.3), formato de exportación (4.6) y diseño.
> - El contrato de datos de la sección 4.6 **se mantiene** y solo **se amplía** (sección 5 de este documento). El frontend existente no debe romperse.

---

## 1. Restricción de los organizadores

Solo se pueden usar datos obtenidos desde estas fuentes:

| Fuente | URL | Qué entrega | Rol en el proyecto |
|---|---|---|---|
| **Giovanni** (NASA GES DISC) | https://giovanni.gsfc.nasa.gov/ | Mapas y series de productos de GES DISC (MERRA-2, IMERG, GLDAS, MODIS atmósfera…) descargables en NetCDF/CSV | **Fuente principal de la grilla global** |
| **Hydrology Time Series / Data Rods** (GES DISC) | https://disc.gsfc.nasa.gov/information/tools?title=Hydrology%20Time%20Series | Series temporales de variables hidrológicas (GLDAS, NLDAS…) **en un punto** | Validación puntual de zonas |
| **AppEEARS** (LP DAAC) | https://appeears.earthdatacloud.nasa.gov/ | Extracción de MODIS/VIIRS/SMAP por punto o área, con API | Capa regional de alta resolución (Centroamérica) |
| **CDO** (NOAA NCEI) | https://www.ncei.noaa.gov/cdo-web/ | Datos de estaciones (GHCN-Daily, GSOM, **GSOY**) | Capa de **estaciones / verificación en tierra** + variables de extremos |
| **Artículo NTRS** (Acker et al., SeaWiFS) | https://ntrs.nasa.gov/api/citations/20090042747/downloads/20090042747.pdf | Antecedente metodológico (no es un dataset) | Cita en el README y en el pitch |

**Reglas:**
- **No descargues datos desde ningún otro origen** (ni earthaccess/OPeNDAP directo, ni otros portales), aunque sean de NASA. Si algo solo está disponible por otro camino, márcalo como `TODO(fuente no permitida)` y avísame.
- Guarda la **trazabilidad**: por cada archivo descargado, en `pipeline/raw/SOURCES.csv` anota fuente, servicio, parámetros (variable, período, área), fecha de descarga y la URL de la solicitud o el ID del job. Va al README y le da reproducibilidad al proyecto.

---

## 2. Catálogo de variables (reemplaza la sección 3 original)

> **Verifica cada variable en el catálogo de Giovanni o AppEEARS antes de usarla.** Los nombres de abajo son candidatos; si un producto no aparece, elige el equivalente disponible en esa misma herramienta y documéntalo. No inventes nombres.

### 2.1 Grilla global (desde Giovanni): capa principal del globo
| id | Nombre UI | Candidato en Giovanni (en orden de preferencia) | Tipo | Dominio | Prioridad |
|---|---|---|---|---|---|
| `precip` | Lluvia | GPM IMERG mensual (precipitación) · alternativa: MERRA-2 PRECTOTCORR | **Satélite** | all | Indispensable |
| `t2m` | Temperatura | MERRA-2 T2M mensual (temperatura del aire a 2 m) | Reanálisis | **all** (sirve también para la temperatura global) | Indispensable |
| `aod` | Partículas en el aire | MODIS Terra/Aqua AOD mensual (MOD08_M3/MYD08_M3) · alternativa: MERRA-2 TOTEXTTAU | **Satélite** | all | Indispensable |
| `sm` | Humedad del suelo | GLDAS Noah mensual, capa 0–10 cm | Modelo | land | Alta |
| `snow` | Nieve | MERRA-2 FRSNO (fracción de nieve) | Reanálisis | land, lat > 30° | Media |
| `sst` | Mar | SST mensual disponible en Giovanni (MODIS u otra) · alternativa: MERRA-2 TS sobre océano | Satélite / reanálisis | ocean | Baja |

**Indispensable:** `precip`, `t2m` y `aod`. Así hay **2 variables satelitales** de misiones de NASA (IMERG, MODIS) y una de modelo, lo que alinea el proyecto con el enunciado.

### 2.2 Estaciones (desde CDO / GSOY): capa "Verificación en tierra" + extremos
| id | Nombre UI | Elemento GSOY | Uso |
|---|---|---|---|
| `st_tavg` | Temperatura (estaciones) | `TAVG` | Verificar `t2m` |
| `st_prcp` | Lluvia (estaciones) | `PRCP` | Verificar `precip` |
| `st_hot` | Días de calor extremo | `DX90` (días con máxima ≥ 32.2 °C) | **Variable nueva, solo estaciones** |
| `st_heavy` | Días de lluvia intensa | `DP1X` (días con ≥ 25.4 mm) | **Variable nueva, solo estaciones** |

### 2.3 Regional en alta resolución (desde AppEEARS): opcional, H7
| id | Nombre UI | Producto candidato | Área |
|---|---|---|---|
| `ndvi_hr` | Vegetación (detalle) | MODIS NDVI mensual a 1 km (p. ej. MOD13A3) | Centroamérica (bbox aprox. lon −93 a −77, lat 7 a 19) |

---

## 3. Obtención de datos

### 3.1 Giovanni → grilla anual global
**Objetivo:** para cada variable de la sección 2.1, obtener un campo global **anual** de 2001 a 2024 (24 campos), o mensual para agregarlo después.

**Pasos:**
1. **Explora la interfaz de Giovanni** y documenta en `DECISIONS.md` cuál de estas rutas funciona mejor (pruébalas en este orden):
   - **a) Servicio de animación o mapas por paso de tiempo** sobre 2001–2024 → página de descargas del resultado → **lista de URLs de los NetCDF** de cada paso (Giovanni suele ofrecer la lista o un script). Descarga esa lista con un script (`pipeline/giovanni_fetch.py`, que recibe un archivo de URLs).
   - **b) "Time Averaged Map" por año** (24 solicitudes por variable). Si la URL de la solicitud es parametrizable, genera las 24 desde un script; si no, documenta el procedimiento manual para el equipo.
   - **c)** Si existe una **API oficial de Giovanni** con token, úsala (verifica la documentación oficial; no adivines endpoints).
2. Si Giovanni limita el número de pasos o el tamaño, **divide por períodos** (p. ej. 2001–2012 y 2013–2024).
3. Guarda los archivos en `pipeline/raw/giovanni/{id}/` y registra cada solicitud en `SOURCES.csv`.
4. Pide **autenticación de Earthdata Login** a la persona del equipo (nunca la guardes en el repo; usa `.netrc` o variables de entorno).
5. **Prueba primero con un solo año y una variable**, y confirma unidades y nombres de variables dentro del NetCDF antes de lanzar todo.

**`build_cube.py` (adaptado):**
- Los NetCDF de Giovanni traen nombres de variable largos y específicos de cada producto. **Detecta automáticamente** la única variable de datos (la que tiene dimensiones de tiempo/lat/lon) y regístrala en el log.
- Unifica coordenadas (lat ascendente o descendente, lon −180..180 o 0..360).
- Si los datos son mensuales, calcula la media anual con un mínimo de 10 meses; si ya son anuales, úsalos directo.
- Regrid a **2°** (promedio por bloques ponderado por área), aplica las máscaras de dominio y produce el mismo `cube.nc` del plan original.
- Conversiones según la unidad que reporte el archivo (no asumas: lee el atributo `units`).

### 3.2 CDO / GSOY → estaciones
1. Los archivos GSOY están en https://www.ncei.noaa.gov/data/gsoy/ (enlazado desde CDO; según su documentación, un CSV por estación). Si hay un archivo comprimido con todas las estaciones, úsalo; si no, descarga solo las estaciones necesarias.
2. **Selección de estaciones:** solo las que tienen **al menos 20 de los 24 años (2001–2024)** con dato en el elemento correspondiente.
3. **Parser (`pipeline/stations.py`):**
   - Formato ancho → largo: `station, year, element, value, attributes`.
   - Columnas variables por estación: no asumas que existen; usa solo las presentes.
   - `DATE` puede venir como `YYYY` o `YYYY-MM`: extrae el año de forma robusta.
   - Coordenadas: usa `LATITUDE`/`LONGITUDE`/`ELEVATION`/`NAME` si vienen en el CSV; si no, crúzalas con la lista de estaciones de GHCN-Daily (enlazada en la documentación de GSOY).
   - **Unidades:** verifica si vienen en métrico o en imperial y normaliza a °C y mm. Los umbrales de `DX90`/`DP1X` son fijos (32.2 °C / 25.4 mm) y no se convierten.
   - **Atributos:** separa el texto con comas (`"a,S"`, `"S,cccc,d"`). Para `PRCP`, **descarta los valores con código de fuente `S`** (la documentación pide usarlos con cautela) y marca los valores con días faltantes.
   - No uses `CLDD`/`HTDD` (el año de la temporada cambia según el hemisferio).
4. **Nota de calidad:** GSOY no tiene corrección por sesgos (la documentación lo aclara). Muéstralo en la UI como "Verificación en tierra (sin homogeneizar)" y no lo uses para calcular la temperatura global.

### 3.3 AppEEARS → capa regional (H7, opcional)
- Usa la **API de AppEEARS** (con token de Earthdata Login; consulta su documentación oficial) para una solicitud de **área** con la bbox de Centroamérica, el producto NDVI mensual a 1 km y salida NetCDF.
- Agrega a medias anuales, calcula Sen/MK/FDR por píxel, reduce la resolución a ~0.05° para la web y exporta `ndvi_hr.bin` + `ndvi_hr_stats.bin` con su propio bloque `grid` en el manifest.

### 3.4 Hydrology Time Series → validación (H7, opcional)
- Para 3–5 lugares de `PLACES` (Guanacaste, Corredor Seco, Sahel…), obtén la serie de la variable hidrológica equivalente (p. ej. humedad del suelo de GLDAS) y compárala en `validate.py` con la serie de la zona calculada desde la grilla (correlación y signo de la tendencia). Solo va al reporte y al README; no a la UI.

---

## 4. Estadísticas con años faltantes (amplía la sección 4.3 original)

Las estaciones tienen huecos. Generaliza `stats.py` (Python) y `lib/stats.js` (cliente) para que acepten `NaN` o `null`:
- **Sen:** pendiente = mediana de `(y_j − y_i)/(año_j − año_i)` sobre los pares con ambos valores.
- **Mann-Kendall:** `S` sobre los pares válidos; `n` = número de años válidos; misma fórmula de varianza.
- **TFPW:** `r1` calculado solo con pares de **años consecutivos** válidos; el pre-blanqueo se aplica solo donde existe `t−1`.
- **Hindcast:** solo si los últimos 5 años tienen dato; si no, no muestres la etiqueta "Probado con el pasado".
- **Comparar años (`mean3`):** promedio de los años válidos en la ventana de 3; si no hay ninguno, la celda o estación queda vacía.
- **Tests nuevos:** series con 10–20 % de huecos aleatorios. Con huecos, los resultados deben coincidir con `pymannkendall` aplicado a la serie sin los NaN (para Sen, comparar contra la implementación con años reales).
- La grilla de Giovanni normalmente no tiene huecos, pero el mismo código debe funcionar en ambos casos.

---

## 5. Ampliación del contrato de datos (sección 4.6 original)

### 5.1 `manifest.json`: campos nuevos (opcionales y retrocompatibles)
```json
{
  "sources": [ { "id": "precip", "tool": "Giovanni", "product": "...", "request": "...", "downloaded": "2026-11-15" } ],
  "variables": [ { "id": "precip", "kind": "grid", "source_tool": "Giovanni", "...": "resto igual que antes" } ],
  "stations": { "file": "stations.json", "elements": ["st_tavg", "st_prcp", "st_hot", "st_heavy"] },
  "regional": [ { "id": "ndvi_hr", "grid": { "res": 0.05, "lat0": 18.975, "lon0": -92.975, "nx": 320, "ny": 240 }, "data": "ndvi_hr.bin", "stats": "ndvi_hr_stats.bin" } ]
}
```

### 5.2 `stations.json`
```json
{
  "years": [2001, 2024],
  "elements": {
    "st_prcp": { "short": "Lluvia (estaciones)", "units": "mm/año", "pairs_with": "precip", "up": "llueve más", "down": "llueve menos" },
    "st_hot":  { "short": "Días de calor extremo", "units": "días/año", "pairs_with": null, "up": "hay más días de calor extremo", "down": "hay menos días de calor extremo" }
  },
  "stations": [
    {
      "id": "XXY########", "name": "…", "lat": 0.0, "lon": 0.0, "elev": 0,
      "series": { "st_prcp": [/* 24 valores o null */] },
      "trend":  { "st_prcp": { "sen_per_decade": 0.0, "p": 0.0, "sig": true, "n": 22 } }
    }
  ]
}
```
- La FDR se aplica **por elemento sobre todas las estaciones**.
- Si el archivo pasa de ~3 MB, divídelo en `stations_{element}.json`.

---

## 6. Cambios en el frontend

1. **Capa de estaciones** (`globe/stations.js`), activable con un interruptor "Estaciones" en la ControlBar:
   - Círculos en su posición (d3 geo, solo los del hemisferio visible).
   - Color = dirección de la tendencia, con la paleta de la variable emparejada (`pairs_with`).
   - Tamaño grande si `sig`; pequeño y gris si no.
   - Tooltip: nombre, años con dato y tendencia en lenguaje sencillo.
2. **Tarjeta "Verificación en tierra"** en el panel de zona (solo si la variable activa tiene un elemento emparejado):
   - Estaciones a ≤ 200 km del punto con tendencia significativa.
   - Texto: "**k de m** estaciones cercanas confirman la dirección del satélite" o "Las estaciones cercanas no muestran una tendencia clara" o "No hay estaciones con serie completa cerca".
   - Etiqueta: "Estaciones GHCN (NOAA), sin homogeneizar".
3. **Variables de extremos** (`st_hot`, `st_heavy`) como chips en la TopBar, marcadas con un icono de estación:
   - Al elegirlas, el globo **no pinta la capa raster**: solo los puntos de estaciones, más una capa suave IDW limitada a 300 km de cada estación (opcional).
   - El panel de zona usa el promedio de **anomalías** de las estaciones a ≤ 200 km (mínimo 2).
   - Modos disponibles: Comparar, Tendencia y Proyección. "¿Y si se calienta?" también funciona usando GT.
4. **Temperatura global (GT)** para "¿Y si se calienta?": media global ponderada por cos(lat) de la **anomalía de `t2m` de MERRA-2** (dominio `all`). No uses estaciones para GT.
5. **Descubrir:** agrega el filtro "Confirmados en tierra", que muestra solo los cambios de la grilla con al menos 2 estaciones cercanas que coinciden en la dirección.
6. **Fuentes en la UI:** el pie del panel muestra la herramienta de origen de la variable activa ("Fuente: GPM IMERG vía Giovanni, NASA GES DISC").

---

## 7. Hitos restantes (reemplazan H4–H8 del plan original)

**H4: Grilla real vía Giovanni (3 variables indispensables)**
- Ruta de descarga validada y documentada en `DECISIONS.md`; `giovanni_fetch.py`; `build_cube.py` adaptado; `stats.py` con soporte de huecos y sus tests; `export.py`.
- ✅ `pytest` pasa; `precip`, `t2m` y `aod` reales se ven en el globo sin cambiar el frontend; `SOURCES.csv` está completo; el aviso "datos simulados" desaparece.

**H5: Descubrir + contrastes con datos reales**
- Igual que H5 del plan original, sobre la grilla real.
- ✅ Al menos 3 contrastes reales con nombres en español.

**H6: Estaciones (CDO/GSOY)**
- `stations.py`, `stations.json`, capa de puntos, tarjeta "Verificación en tierra", chips `st_hot`/`st_heavy`, filtro "Confirmados en tierra".
- ✅ Para Costa Rica/Centroamérica, el panel muestra cuántas estaciones confirman la tendencia (o explica que no hay estaciones suficientes).

**H7: ¿Y si se calienta? + variables extra + validación**
- GT desde `t2m` real; sensibilidades; `sm` y `snow` desde Giovanni; `validate.py` (prueba nula, hindcast, comparación con Hydrology Time Series).
- Opcional, si sobra tiempo: capa regional AppEEARS de NDVI a 1 km que reemplaza la capa global al hacer zoom ≥ 3 sobre Centroamérica.
- ✅ La prueba nula da ≤ 1 % con FDR; las zonas de confianza del slider usan `GT_OBS` real.

**H8: Entrega**
- Deploy, README con una tabla de fuentes (herramienta, producto, variable, período, fecha de descarga), método y citas. Agregar a las citas: Acker et al., "Time-Series Analysis of Remotely-Sensed SeaWiFS Chlorophyll in River-Influenced Coastal Regions" (NTRS 20090042747), como antecedente del análisis de tendencias con datos de Giovanni.
- ✅ URL pública funcionando en desktop y móvil; demo ensayada.

**Si falta tiempo, recortar en este orden:** AppEEARS → Hydrology Time Series → `sst` → `snow` → capa IDW de estaciones → filtro "Confirmados en tierra".

---

## 8. Reglas adicionales para Claude Code
1. Solo las fuentes de la sección 1. Ante la duda, pregunta antes de descargar.
2. Prueba siempre con **un año y una variable** antes de lanzar descargas completas, y avísame si el total supera ~2 GB.
3. Lee las unidades y los nombres de variable **desde los archivos**; nunca los asumas.
4. Mantén funcionando el mock (`mock.py`) con el contrato ampliado, para poder desarrollar el frontend sin datos reales.
5. Cada cambio estadístico (soporte de huecos) va con sus tests antes de usarse en la exportación.
