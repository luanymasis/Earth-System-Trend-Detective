<script setup>
// Flecha ▲▼ con el color del extremo de la paleta de la variable (PLAN §6.2).
// Solo se colorea si el cambio es confiable (nivel ≥ 3).
import { computed } from 'vue'
import { upCol, downCol } from '../../lib/colors.js'
const props = defineProps({ palette: String, stats: Object })
const sig = computed(() => props.stats && props.stats.level >= 3)
const up = computed(() => props.stats && props.stats.r.slope > 0)
</script>

<template>
  <span class="arr" aria-hidden="true"
    :style="{ background: sig ? (up ? upCol(palette) : downCol(palette)) : '#d9d3b5', color: sig ? '#fff' : '#6b6f52' }">
    {{ sig ? (up ? '▲' : '▼') : '–' }}
  </span>
</template>
