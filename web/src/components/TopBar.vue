<script setup>
import { useAppStore } from '../stores/app.js'
const app = useAppStore()
</script>

<template>
  <header class="top">
    <div class="brand">
      <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="none" stroke="#606c38" stroke-width="2.2"/><path d="M15 24c0-7 1-11 7-15-1 6-3 10-7 15zm0 0c0-5-1-8-6-11 0 5 2 8 6 11z" fill="#606c38"/></svg>
      <h1>Pulso Verde</h1>
    </div>
    <span class="sub">Impacto de la deforestación, los incendios y la reforestación, y cuánto tarda cada variable en restaurarse</span>
    <div class="vars" role="group" aria-label="Variable a mostrar">
      <button v-for="v in app.variables" :key="v.id" type="button" class="vchip"
              :aria-pressed="v.id === app.variableId" :title="v.name" @click="app.setVariable(v.id)">{{ v.short }}</button>
    </div>
  </header>
</template>

<style scoped>
.top{display:flex;align-items:center;gap:14px;padding:9px 16px;border-bottom:1px solid var(--line);background:var(--surface);flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:8px}
.brand h1{font-size:17px}
.brand small{font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:1px 8px}
.sub{font-size:12px;color:var(--muted);max-width:420px}
.vars{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
.vchip{border:1px solid var(--line);background:transparent;border-radius:999px;padding:5px 11px;cursor:pointer;font-size:13.5px;font-weight:600;color:var(--muted)}
.vchip:hover{border-color:var(--accent);color:var(--ink)}
.vchip[aria-pressed="true"]{background:var(--deep);border-color:var(--deep);color:var(--bg)}
</style>
