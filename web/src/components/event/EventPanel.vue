<script setup>
import { computed } from 'vue'
import { useAppStore } from '../../stores/app.js'
import { TYPES } from '../../lib/colors.js'
import { plainVar, headline, spark, ICON } from '../../lib/eventText.js'
import { YRS } from '../../lib/format.js'
import { NEWS } from '../../data/news.js'
import EventSelect from './EventSelect.vue'

const app = useAppStore()
const ev = computed(() => app.ev)
const A = computed(() => app.A)
const cards = computed(() => !A.value ? [] : app.variables.map(v => {
  const r = A.value.R[v.id]
  return { v, P: plainVar(ev.value, v, r), svg: spark(ev.value, v, r, A.value) }
}))
const baseYears = computed(() => A.value ? A.value.pre[1] - A.value.pre[0] + 1 : 0)
const news = computed(() => NEWS[ev.value?.id] ?? [])
</script>

<template>
  <template v-if="ev">
    <EventSelect />
    <div>
      <div class="k"><span :class="['tag', ev.type]">{{ TYPES[ev.type].l }} · {{ ev.year }}</span></div>
      <h2 class="rname">{{ ev.place }}</h2>
      <p class="summary">{{ ev.desc }}</p>
    </div>
    <p v-if="!A" class="empty" role="status">Cargando las series del evento…</p>
    <template v-else>
      <div class="verdict">
        <span class="ic" :style="{ background: TYPES[ev.type].c }" aria-hidden="true">{{ ev.type === 'reforestacion' ? '↑' : '↓' }}</span>
        <h3>{{ headline(ev, A.R, app.variables) }}</h3>
      </div>
      <div class="vgrid">
        <div v-for="c in cards" :key="c.v.id" :class="['vcard', c.P.tone]">
          <div class="vt"><span v-html="ICON[c.v.id]"></span>{{ c.v.short }}</div>
          <div class="vm" :style="{ color: c.P.col || 'var(--muted)' }">{{ c.P.main }}</div>
          <div class="vs">{{ c.P.sub }}</div>
          <div v-html="c.svg"></div>
        </div>
      </div>
      <p class="small note">
        La franja gris es lo normal antes del evento; la línea punteada marca el año del evento.
        <template v-if="baseYears < 4">Línea base corta ({{ YRS(baseYears) }}).</template>
        Asociación, no prueba de causa.
      </p>
      <div v-if="news.length" class="card">
        <h3>En las noticias</h3>
        <p class="lead"><a :href="news[0].url" target="_blank" rel="noopener">{{ news[0].title }}</a><br>
          <span class="small">{{ news[0].src }} · {{ news[0].date }}</span></p>
        <button class="btn" type="button" @click="app.setTab('news')">Ver {{ news.length }} noticias sobre este evento</button>
      </div>
    </template>
  </template>
</template>

<style scoped>
.rname{font-size:20px;line-height:1.2;margin-top:4px}
.summary{font-size:14px;color:var(--muted);margin:4px 0 0}
.verdict{display:flex;gap:10px;align-items:flex-start;border-radius:12px;padding:12px;background:var(--raised)}
.verdict .ic{width:34px;height:34px;flex:none;border-radius:9px;display:grid;place-items:center;color:#fff;font-weight:700}
.verdict h3{font-size:16px;line-height:1.3}
.note{margin:0}
.lead{margin:0 0 8px}
.lead a{color:var(--ink);font-weight:700}
</style>
