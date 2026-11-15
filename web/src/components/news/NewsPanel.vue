<script setup>
import { computed } from 'vue'
import { useAppStore } from '../../stores/app.js'
import { TYPES } from '../../lib/colors.js'
import { NEWS } from '../../data/news.js'
import EventSelect from '../event/EventSelect.vue'

const app = useAppStore()
const ev = computed(() => app.ev)
const list = computed(() => NEWS[ev.value?.id] ?? [])
</script>

<template>
  <template v-if="ev">
    <EventSelect />
    <div>
      <div class="k"><span :class="['tag', ev.type]">{{ TYPES[ev.type].l }} · {{ ev.year }}</span></div>
      <h2 class="rname">Noticias sobre {{ ev.place.split(',')[0] }}</h2>
    </div>
    <div class="news">
      <article v-for="n in list" :key="n.url" class="ncard">
        <div class="meta"><span>{{ n.src }}</span><span>·</span><span>{{ n.date }}</span><span class="lang">{{ n.lang }}</span></div>
        <a class="t" :href="n.url" target="_blank" rel="noopener">{{ n.title }}</a>
        <p>{{ n.sum }}</p>
        <a class="go" :href="n.url" target="_blank" rel="noopener">Leer la noticia ↗</a>
      </article>
      <p v-if="!list.length" class="empty">Sin noticias para este evento.</p>
    </div>
    <p class="small">Enlaces a medios externos; títulos traducidos y resúmenes propios.{{ app.partial ? ' Parte de los datos del mapa son simulados para la demo.' : (app.synthetic ? ' Los datos del mapa son simulados para la demo.' : '') }}</p>
  </template>
</template>

<style scoped>
.rname{font-size:20px;line-height:1.2;margin-top:4px}
.news{display:grid;gap:10px}
.ncard{border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:var(--surface);display:grid;gap:6px}
.meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--muted);font-weight:600}
.lang{font-size:10.5px;font-weight:700;border:1px solid var(--line);border-radius:6px;padding:0 6px;color:var(--muted)}
.t{font:700 15px/1.3 var(--font-display);color:var(--ink);text-decoration:none}
.t:hover{text-decoration:underline;color:var(--accent)}
.ncard p{margin:0;font-size:13.5px}
.go{font-size:13px;font-weight:700;color:var(--accent);text-decoration:none}
</style>
