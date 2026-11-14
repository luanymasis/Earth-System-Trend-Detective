<script setup>
import { useAppStore } from '../stores/app.js'
const app = useAppStore()
</script>

<template>
  <header class="top">
    <div class="brand">
      <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="none" stroke="#606c38" stroke-width="2.2"/><path d="M3 16h6l3-7 4 13 3-8 2 2h6" fill="none" stroke="#bc6c25" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>
      <h1>Pulso Terrestre</h1>
      <small v-if="app.synthetic">Demo · datos simulados</small>
    </div>
    <div class="vars" role="group" aria-label="Qué quieres ver">
      <button v-for="v in app.variables" :key="v.id" type="button" class="vchip"
              :aria-pressed="v.id === app.variableId" :title="v.q" @click="app.setVariable(v.id)">{{ v.short }}</button>
    </div>
  </header>
</template>

<style scoped>
.top{display:flex;align-items:center;gap:16px;padding:10px 16px;border-bottom:1px solid var(--line);background:var(--surface);flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:8px}
.brand h1{font-size:17px}
.brand small{font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:1px 8px}
.vars{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
.vchip{border:1px solid var(--line);background:transparent;border-radius:999px;padding:5px 12px;cursor:pointer;font-size:14px;font-weight:600;color:var(--muted)}
.vchip:hover{border-color:var(--accent);color:var(--ink)}
.vchip[aria-pressed="true"]{background:var(--deep);border-color:var(--deep);color:var(--bg)}
</style>
