# Validación del análisis de eventos

Generado por `web/scripts/validate.mjs` el 2026-11-15 con los datos de `web/public/data`.
## 1. Placebo temporal

Eventos con ≥ 10 años previos: Kalimantan 2015, Sureste de Australia 2020, Chiquitanía 2019, Khyber Pakhtunkhwa 2014, Tierras altas de Etiopía 2019. Años falsos: 2008, 2009, 2010, 2011.

**Falsos positivos: 1 de 20 pruebas (5 %).** Criterio: ≤ 10 % → ✅ cumple.

| Variable | Pruebas | Con «cambio significativo» |
|---|---|---|
| Vegetación | 0 | 0 (—) |
| Temperatura | 0 | 0 (—) |
| Humedad | 20 | 1 (5 %) |
| Precipitación | 0 | 0 (—) |

| Evento | Año falso | Variable | Estado | p |
|---|---|---|---|---|
| Chiquitanía, Bolivia | 2009 | Humedad | persistent | 0.047 |

## 2. Sensibilidad a la línea base (4 vs 6 años)

| Evento | Variable | 6 años | 4 años |
|---|---|---|---|
| Sureste de Australia | Humedad | none | recovered |
| Mata Atlántica, Brasil | Humedad | effect | noeffect |

Cambian de estado 2 de 8 casos (25 %); en la tabla solo aparecen los que cambian.

## 3. Verificación con GLDAS

Dirección del cambio en los 3 primeros años del evento respecto a la línea base (diferencia evento − comparación).
La temperatura de piel de GLDAS es otra medida que la LST de MODIS: solo se compara la dirección.

| Evento | Pareja | Dirección (UI / GLDAS) | Coincide | r anual |
|---|---|---|---|---|
| Rondônia, Brasil | Precipitación vs Rainf_f_tavg | + / + | ❌ | 0.00 |
| Rondônia, Brasil | Temperatura vs Tair_f_inst | + / + | ❌ | 0.00 |
| Chaco paraguayo | Precipitación vs Rainf_f_tavg | + / + | ❌ | 0.00 |
| Chaco paraguayo | Temperatura vs Tair_f_inst | + / − | ❌ | 0.00 |
| Kalimantan, Indonesia | Precipitación vs Rainf_f_tavg | + / + | ❌ | 0.00 |
| Kalimantan, Indonesia | Temperatura vs Tair_f_inst | + / − | ❌ | 0.00 |
| Sureste de Australia | Precipitación vs Rainf_f_tavg | + / + | ❌ | 0.00 |
| Sureste de Australia | Temperatura vs Tair_f_inst | + / − | ❌ | 0.00 |
| Chiquitanía, Bolivia | Precipitación vs Rainf_f_tavg | + / + | ❌ | 0.00 |
| Chiquitanía, Bolivia | Temperatura vs Tair_f_inst | + / − | ❌ | 0.00 |
| Mata Atlántica, Brasil | Precipitación vs Rainf_f_tavg | + / − | ❌ | 0.00 |
| Mata Atlántica, Brasil | Temperatura vs Tair_f_inst | + / + | ❌ | 0.00 |
| Khyber Pakhtunkhwa, Pakistán | Precipitación vs Rainf_f_tavg | + / − | ❌ | 0.00 |
| Khyber Pakhtunkhwa, Pakistán | Temperatura vs Tair_f_inst | + / − | ❌ | 0.00 |
| Tierras altas de Etiopía | Precipitación vs Rainf_f_tavg | + / − | ❌ | 0.00 |
| Tierras altas de Etiopía | Temperatura vs Tair_f_inst | + / + | ❌ | 0.00 |
