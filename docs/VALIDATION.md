# Validación del análisis de eventos

Generado por `web/scripts/validate.mjs` el 2026-11-15 con los datos de `web/public/data`.

> ⚠ El manifest tiene variables **simuladas**: Vegetación, Temperatura, Precipitación. Sus resultados solo prueban el método, no la realidad.

## 1. Placebo temporal

Eventos con ≥ 10 años previos: Kalimantan 2015, Sureste de Australia 2020, Chiquitanía 2019, Khyber Pakhtunkhwa 2014, Tierras altas de Etiopía 2019. Años falsos: 2008, 2009, 2010, 2011.

**Falsos positivos: 5 de 80 pruebas (6 %).** Criterio: ≤ 10 % → ✅ cumple.

| Variable | Pruebas | Con «cambio significativo» |
|---|---|---|
| Vegetación (simulada) | 20 | 4 (20 %) |
| Temperatura (simulada) | 20 | 0 (0 %) |
| Humedad | 20 | 1 (5 %) |
| Precipitación (simulada) | 20 | 0 (0 %) |

| Evento | Año falso | Variable | Estado | p |
|---|---|---|---|---|
| Kalimantan, Indonesia | 2008 | Vegetación (simulada) | persistent | 0.006 |
| Kalimantan, Indonesia | 2009 | Vegetación (simulada) | persistent | 0.003 |
| Kalimantan, Indonesia | 2010 | Vegetación (simulada) | persistent | 0.003 |
| Kalimantan, Indonesia | 2011 | Vegetación (simulada) | persistent | 0.006 |
| Chiquitanía, Bolivia | 2009 | Humedad | persistent | 0.047 |

## 2. Sensibilidad a la línea base (4 vs 6 años)

| Evento | Variable | 6 años | 4 años |
|---|---|---|---|
| Kalimantan, Indonesia | Temperatura (simulada) | none | recovered |
| Sureste de Australia | Humedad | none | persistent |
| Mata Atlántica, Brasil | Humedad | effect | noeffect |
| Khyber Pakhtunkhwa, Pakistán | Precipitación (simulada) | noeffect | effect |

Cambian de estado 4 de 32 casos (13 %); en la tabla solo aparecen los que cambian.

## 3. Verificación con GLDAS

Dirección del cambio en los 3 primeros años del evento respecto a la línea base (diferencia evento − comparación).
La temperatura de piel de GLDAS es otra medida que la LST de MODIS: solo se compara la dirección.

| Evento | Pareja | Dirección (UI / GLDAS) | Coincide | r anual |
|---|---|---|---|---|
| Rondônia, Brasil | Precipitación (simulada) vs Rainf_f_tavg | − / + | ❌ | -0.02 |
| Rondônia, Brasil | Temperatura (simulada) vs AvgSurfT_inst | + / + | ✅ | 0.07 |
| Chaco paraguayo | Precipitación (simulada) vs Rainf_f_tavg | − / + | ❌ | -0.13 |
| Chaco paraguayo | Temperatura (simulada) vs AvgSurfT_inst | + / − | ❌ | 0.40 |
| Kalimantan, Indonesia | Precipitación (simulada) vs Rainf_f_tavg | − / + | ❌ | 0.14 |
| Kalimantan, Indonesia | Temperatura (simulada) vs AvgSurfT_inst | + / − | ❌ | -0.36 |
| Sureste de Australia | Precipitación (simulada) vs Rainf_f_tavg | + / + | ✅ | 0.09 |
| Sureste de Australia | Temperatura (simulada) vs AvgSurfT_inst | + / − | ❌ | 0.17 |
| Chiquitanía, Bolivia | Precipitación (simulada) vs Rainf_f_tavg | − / + | ❌ | -0.38 |
| Chiquitanía, Bolivia | Temperatura (simulada) vs AvgSurfT_inst | + / − | ❌ | 0.09 |
| Mata Atlántica, Brasil | Precipitación (simulada) vs Rainf_f_tavg | − / − | ✅ | 0.23 |
| Mata Atlántica, Brasil | Temperatura (simulada) vs AvgSurfT_inst | − / + | ❌ | -0.69 |
| Khyber Pakhtunkhwa, Pakistán | Precipitación (simulada) vs Rainf_f_tavg | + / − | ❌ | -0.04 |
| Khyber Pakhtunkhwa, Pakistán | Temperatura (simulada) vs AvgSurfT_inst | + / − | ❌ | -0.01 |
| Tierras altas de Etiopía | Precipitación (simulada) vs Rainf_f_tavg | − / − | ✅ | -0.16 |
| Tierras altas de Etiopía | Temperatura (simulada) vs AvgSurfT_inst | − / + | ❌ | -0.28 |
