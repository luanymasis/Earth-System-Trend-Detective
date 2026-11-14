# Decisiones no cubiertas por el plan

Formato: fecha · hito · decisión · por qué.

1. **2026-11-14 · H1 · `domain` en el manifest es la clave de máscara del pipeline** (`all`, `land`, `land_core`, `ocean`, `snow`) y se añade **`clip`** (`all` | `land` | `ocean`) para recortar la capa en el globo. El plan usaba `domain` para ambas cosas, pero `snow` y `land_core` necesitan otra máscara y el mismo recorte que `land`.
2. **2026-11-14 · H1 · Extensiones del contrato de datos (§4.6):** `synthetic` (bool), `stats_fields` (orden de los bloques de `_stats.bin`) y `clip`. Son aditivas; el frontend las usa.
3. **2026-11-14 · H1 · `t2m` usa la máscara `land` (incluye la Antártida)**, como `landAll` en el prototipo; `sm` y `ndvi` usan `land_core` (sin Antártida ni Groenlandia), como `land` en el prototipo.
4. **2026-11-14 · H1 · `web/public/data/` no se versiona**: se regenera con `python pipeline/mock.py` (5 s) o con el pipeline real. En H8 decidimos si el deploy corre el mock o se suben los datos reales.
5. **2026-11-14 · H1 · Máscara del mock por geometría** (`world-atlas/land-110m.json` copiado a `pipeline/assets/`, con `matplotlib.path`) en vez de geopandas, para no exigir dependencias pesadas solo para el mock. Imita el muestreo de 9 puntos del prototipo, pero puede diferir en celdas de costa. Como el ruido se genera celda a celda con el mismo RNG (portado bit a bit, verificado), una celda distinta desplaza la secuencia y los valores no coinciden exactamente con el prototipo. Para el criterio de H3 («±1 % vs. prototipo») habrá que comparar las funciones portadas con entradas idénticas, no los datos.
6. **2026-11-14 · H1 · `mock.py --res 3`** genera la grilla de 3° del prototipo para comparaciones.
