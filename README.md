# Pulso Terrestre

Globo interactivo para ver **qué cambia, dónde, cuánto y si el cambio es estadísticamente significativo** en variables de misiones y modelos de ciencias de la Tierra de la NASA (NASA Space Apps Challenge, *Earth System Trend Detective*).

> Estado: **H1 (esqueleto + datos simulados)**. La especificación completa está en `PLAN_PULSO_TERRESTRE.md`.

## Estructura

```
pipeline/   Python: datos → cubo anual a 2° → estadística → archivos para la web
web/        Vue 3 + Vite + Pinia: el globo y los paneles (sitio estático)
```

## Cómo correrlo

Requisitos: Python 3.11+ y Node 20+.

```bash
# 1. Datos simulados (mismo formato que el pipeline real), ~5 s
pip install -r pipeline/requirements.txt
python pipeline/mock.py            # escribe web/public/data/

# 2. Web
cd web
npm install
npm run dev                        # http://localhost:5173
```

Tests de estadística: `python -m pytest pipeline/tests`.

Con datos simulados la interfaz muestra el aviso «Demo · datos simulados».

## Contrato de datos (`web/public/data/`)

| Archivo | Contenido |
|---|---|
| `manifest.json` | grilla, años, serie de temperatura global (`gt`), metadata de cada variable |
| `{id}.bin` | Int16 little-endian, orden `[celda][año]`, valor = `int*scale + offset`, faltante = −32768 |
| `{id}_stats.bin` | Float32 little-endian, 6 bloques de `nx*ny`: `sen_per_decade, p_trend, sig_trend, sens_b, p_sens, sig_sens` |
| `discover.json` | `{ "changes": [...], "contrasts": [...] }` (se llena en H5) |

La celda `c = i*nx + j`, con `i = 0` en el norte (`lat0 = 89`) y `j = 0` en `lon0 = −179`.

## Método

Pendiente de Sen (Sen 1968), Mann-Kendall (Mann 1945; Kendall 1975) con pre-blanqueo TFPW (Yue et al. 2002), corrección FDR de Benjamini & Hochberg (1995; ver Wilks 2016), tiempo de detección (Weatherhead et al. 1998) y *pattern scaling* (Tebaldi & Arblaster 2014).

## Datasets de NASA

Ver `pipeline/config.py`. Los short names se verifican en [Earthdata Search](https://search.earthdata.nasa.gov) antes de descargar (H4); los que aún no están verificados llevan `TODO(verificar)`.
