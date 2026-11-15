<script setup>
import { useAppStore } from '../stores/app.js'
import EventPanel from './event/EventPanel.vue'
import NewsPanel from './news/NewsPanel.vue'
import SimPanel from './sim/SimPanel.vue'
const app = useAppStore()
const TABS = [{ id: 'event', l: 'Evento' }, { id: 'news', l: 'Noticias' }, { id: 'sim', l: 'Simular' }]
</script>

<template>
  <aside class="side">
    <div class="tabs" role="tablist">
      <button v-for="t in TABS" :key="t.id" type="button" role="tab" :id="`tab-${t.id}`" :aria-selected="app.tab === t.id"
              aria-controls="pane" @click="app.setTab(t.id)">{{ t.l }}</button>
    </div>
    <div class="pane" id="pane" role="tabpanel" :aria-labelledby="`tab-${app.tab}`">
      <EventPanel v-if="app.tab === 'event'" />
      <NewsPanel v-else-if="app.tab === 'news'" />
      <SimPanel v-else />
    </div>
    <div class="foot">Fuente: {{ app.meta?.product ?? '—' }}</div>
  </aside>
</template>

<style scoped>
.side{border-left:1px solid var(--line);background:var(--surface);display:flex;flex-direction:column;min-height:0}
.tabs{display:flex;border-bottom:1px solid var(--line)}
.tabs button{flex:1;border:0;background:transparent;padding:12px 6px;font-weight:700;font-size:14px;cursor:pointer;color:var(--muted);border-bottom:2px solid transparent}
.tabs button[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--brown)}
.pane{padding:16px;overflow:auto;display:flex;flex-direction:column;gap:12px;flex:1}
.foot{font-size:11px;color:var(--muted);padding:9px 16px;border-top:1px solid var(--line)}
@media (max-width:980px){ .side{border-left:0;border-top:1px solid var(--line)} }
</style>
