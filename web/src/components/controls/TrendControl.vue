<script setup>
import { useAppStore } from '../../stores/app.js'
const app = useAppStore()
</script>

<template>
  <div class="ctlrow"><b>Cambio sostenido {{ app.years[0] }}–{{ app.years[1] }}</b><span class="note">Solo se pintan las zonas donde el cambio es estadísticamente confiable.</span></div>
  <slot name="legend" />
</template>
