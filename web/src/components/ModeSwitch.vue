<script setup>
import { useAppStore } from '../stores/app.js'
const app = useAppStore()
const MODES = [
  { id: 'compare', label: 'Comparar años' },
  { id: 'trend', label: 'Tendencia' },
  { id: 'forecast', label: 'Proyección' },
  { id: 'whatif', label: '¿Y si se calienta?' }
]
</script>

<template>
  <div class="mode" role="group" aria-label="Qué mostrar">
    <button v-for="m in MODES" :key="m.id" type="button" :aria-pressed="app.mode === m.id" @click="app.setMode(m.id)">{{ m.label }}</button>
  </div>
</template>

<style scoped>
.mode{position:absolute;left:50%;top:14px;transform:translateX(-50%);display:flex;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:3px;box-shadow:0 2px 10px rgba(40,54,24,.08);max-width:calc(100% - 80px);overflow-x:auto;scrollbar-width:none}
.mode button{border:0;background:transparent;border-radius:999px;padding:7px 16px;cursor:pointer;font-weight:600;font-size:14px;color:var(--muted);white-space:nowrap}
.mode button:hover{color:var(--ink)}
.mode button[aria-pressed="true"]{background:var(--accent);color:var(--bg)}
@media (max-width:560px){ .mode{left:12px;transform:none;max-width:calc(100% - 66px)} .mode button{padding:6px 10px;font-size:13px} }
</style>
