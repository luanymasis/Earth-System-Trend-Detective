<script setup>
import { computed } from 'vue'
import { useAppStore } from '../../stores/app.js'
const app = useAppStore()
const y0 = computed(() => app.years[0])
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, k) => lo + k)
// Mientras se anima, el selector A muestra el año que se está pintando.
const shownA = computed(() => (app.playing ? Math.floor(app.yearAf) : app.yearA))
</script>

<template>
  <div class="ctlrow">
    Comparar
    <select aria-label="Año a comparar" :value="shownA" @change="app.setYearA(+$event.target.value)">
      <option v-for="t in range(1, app.nyears - 1)" :key="t" :value="t">{{ y0 + t }}</option>
    </select>
    con
    <select aria-label="Año de referencia" :value="app.yearB" @change="app.setYearB(+$event.target.value)">
      <option v-for="t in range(0, app.nyears - 2)" :key="t" :value="t">{{ y0 + t }}</option>
    </select>
    <button class="play" type="button" @click="app.togglePlay()">{{ app.playing ? '❚❚ Pausa' : '▶ Ver cómo cambió' }}</button>
  </div>
  <slot name="legend" />
  <div class="note">Cada año es el promedio de 3 años a su alrededor, para no confundir un año raro con un cambio. Sin color: diferencia pequeña.</div>
</template>

<style scoped>
.play{border:0;background:var(--brown);color:#fff;border-radius:999px;padding:6px 14px;font-weight:700;font-size:13px;cursor:pointer;margin-left:auto}
.play:hover{filter:brightness(1.08)}
</style>
