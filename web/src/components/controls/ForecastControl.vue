<script setup>
import { useAppStore } from '../../stores/app.js'
const app = useAppStore()
const HORIZONS = [2026, 2030, 2035]
</script>

<template>
  <div class="ctlrow">Si la tendencia continúa, así estaría en
    <select aria-label="Año de la proyección" :value="app.horizon" @change="app.horizon = +$event.target.value">
      <option v-for="y in HORIZONS" :key="y" :value="y">{{ y }}</option>
    </select>
    comparado con lo normal
  </div>
  <slot name="legend" />
  <div class="note">Proyección estadística de la tendencia observada, no un modelo climático. Solo se muestran zonas con tendencia confiable.</div>
</template>
