<script setup>
import { useAppStore } from '../../stores/app.js'
import { TYPES } from '../../lib/colors.js'
const app = useAppStore()
</script>

<template>
  <select aria-label="Elegir evento" :value="app.eventId" @change="app.selectEvent($event.target.value)">
    <optgroup v-for="(t, k) in TYPES" :key="k" :label="t.l">
      <option v-for="e in app.events.filter(e => e.type === k)" :key="e.id" :value="e.id">{{ e.place }} · {{ e.year }}</option>
    </optgroup>
  </select>
</template>

<style scoped>
select{width:100%}
</style>
