<script setup>
import { useAppStore } from '../stores/app.js'
import { fmtLL } from '../lib/format.js'
const app = useAppStore()
</script>

<template>
  <aside class="side">
    <div class="tabs" role="tablist">
      <button type="button" role="tab" id="tab-zone" :aria-selected="app.tab === 'zone'" aria-controls="pane" @click="app.setTab('zone')">Esta zona</button>
      <button type="button" role="tab" id="tab-disc" :aria-selected="app.tab === 'disc'" aria-controls="pane" @click="app.setTab('disc')">Descubrir</button>
    </div>
    <div class="pane" id="pane" role="tabpanel" :aria-labelledby="app.tab === 'zone' ? 'tab-zone' : 'tab-disc'">
      <template v-if="app.tab === 'zone'">
        <div v-if="!app.zone" class="empty">Toca cualquier zona del globo para ver qué está cambiando ahí.</div>
        <template v-else>
          <div class="zone">
            <span class="k">{{ app.meta?.short }}</span>
            <h2>{{ app.zone.name }}</h2>
            <p class="empty coords">{{ fmtLL(app.zone.lat, app.zone.lon) }}</p>
          </div>
          <!-- TODO(H3): titular, confianza, datos, proyección, ¿cuándo lo sabremos?, contraste, cambia junto con -->
          <p class="empty">El análisis de la zona llega en el siguiente hito.</p>
        </template>
      </template>
      <template v-else>
        <div>
          <span class="k">Modo descubrimiento</span>
          <h2 class="dtitle">¿Qué está cambiando más en el planeta?</h2>
        </div>
        <div class="empty">Próximamente: los mayores cambios y los contrastes más llamativos.</div>
      </template>
    </div>
    <div class="foot">
      {{ app.synthetic ? 'Valores simulados con patrones plausibles · ' : '' }}Fuente: {{ app.meta?.product ?? '—' }} · Mann-Kendall + Sen + FDR
    </div>
  </aside>
</template>

<style scoped>
.side{border-left:1px solid var(--line);background:var(--surface);display:flex;flex-direction:column;min-height:0}
.tabs{display:flex;border-bottom:1px solid var(--line)}
.tabs button{flex:1;border:0;background:transparent;padding:12px;font-weight:700;font-size:14px;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent}
.tabs button[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--brown)}
.pane{padding:16px;overflow:auto;display:flex;flex-direction:column;gap:14px;flex:1}
.dtitle{font-size:19px;margin-top:2px}
.zone h2{font-size:21px;line-height:1.2;margin-top:2px}
.coords{margin:2px 0 0}
.foot{font-size:11px;color:var(--muted);padding:10px 16px;border-top:1px solid var(--line)}
@media (max-width:960px){ .side{border-left:0;border-top:1px solid var(--line)} }
</style>
