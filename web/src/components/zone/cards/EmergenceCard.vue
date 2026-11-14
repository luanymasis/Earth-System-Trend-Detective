<script setup>
// "¿Cuándo lo sabremos?" (PLAN §7.5.7). Weatherhead et al. 1998.
import { computed } from 'vue'
import { useAppStore } from '../../../stores/app.js'
const props = defineProps({ stats: Object })
const app = useAppStore()

const msg = computed(() => {
  const yrs = props.stats.toe, n = props.stats.n
  if (!Number.isFinite(yrs) || yrs > 100) return { t: 'El cambio es tan pequeño frente a la variación natural que harían falta más de 100 años de datos para confirmarlo. En la práctica, aquí no está cambiando.' }
  if (yrs <= n) return { t: 'Al ritmo actual, uno o dos años más de datos deberían bastar para confirmarlo.' }
  return { more: Math.ceil(yrs - n), year: app.years[0] + Math.round(yrs) }
})
</script>

<template>
  <div class="card">
    <h3>¿Cuándo lo sabremos? <span class="tag">Exclusivo</span></h3>
    <p v-if="msg.t">{{ msg.t }}</p>
    <p v-else>Al ritmo actual harían falta <b>{{ msg.more }} {{ msg.more === 1 ? 'año' : 'años' }} más</b> de observación para confirmarlo (hacia <b>{{ msg.year }}</b>).</p>
    <p class="small">Considera el ruido entre años y su autocorrelación (Weatherhead et al., 1998).</p>
  </div>
</template>
