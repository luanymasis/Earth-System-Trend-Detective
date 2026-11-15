<script setup>
import { computed } from 'vue'
import { useAppStore } from '../stores/app.js'
import { TYPES } from '../lib/colors.js'

const app = useAppStore()
const coordinates = event => `${event.lat.toFixed(1)}°, ${event.lon.toFixed(1)}°`
const categories = computed(() => [
  { id: 'all', label: 'Todos' },
  ...Object.entries(TYPES)
    .filter(([id]) => app.events.some(event => event.type === id))
    .map(([id, type]) => ({ id, label: type.l }))
])
const visibleEvents = computed(() => app.visibleEvents)
</script>

<template>
  <section v-if="app.events.length" class="event-list" aria-labelledby="event-list-title">
    <div class="list-heading">
      <div>
        <p class="eyebrow">Explorar</p>
        <h2 id="event-list-title">Eventos</h2>
      </div>
      <span class="count">{{ app.events.length }}</span>
    </div>
    <div class="filters" role="tablist" aria-label="Categorías de eventos">
      <button
        v-for="category in categories"
        :key="category.id"
        type="button"
        role="tab"
        :aria-selected="app.eventType === category.id"
        :tabindex="app.eventType === category.id ? 0 : -1"
        @click="app.setEventType(category.id)"
      >
        {{ category.label }}
        <span>{{ category.id === 'all' ? app.events.length : app.events.filter(event => event.type === category.id).length }}</span>
      </button>
    </div>
    <p class="hint">Selecciona un evento para mover el globo a sus coordenadas.</p>
    <div class="events" role="list">
      <button
        v-for="event in visibleEvents"
        :key="event.id"
        type="button"
        role="listitem"
        :class="['event', { active: event.id === app.eventId }]"
        :aria-pressed="event.id === app.eventId"
        @click="app.selectEvent(event.id)"
      >
        <span class="marker" :style="{ backgroundColor: TYPES[event.type]?.c || 'var(--accent)' }" aria-hidden="true"></span>
        <span class="event-copy">
          <strong>{{ event.place }}</strong>
          <span class="event-meta">{{ TYPES[event.type]?.l || event.type }} · {{ event.year }}</span>
          <span class="event-coordinates">{{ coordinates(event) }}</span>
        </span>
        <span class="arrow" aria-hidden="true">↗</span>
      </button>
    </div>
    <p v-if="!visibleEvents.length" class="empty">No hay eventos en esta categoría.</p>
  </section>
</template>

<style scoped>
.event-list{position:absolute;left:16px;top:54px;width:min(290px,calc(100% - 32px));max-height:calc(100% - 150px);display:flex;flex-direction:column;padding:13px;background:rgba(255,253,245,.94);border:1px solid var(--line);border-radius:13px;box-shadow:0 6px 20px rgba(40,54,24,.14);z-index:3}
.list-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}
.eyebrow{margin:0;color:var(--brown);font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
h2{font-size:18px;line-height:1.2}
.count{display:grid;place-items:center;min-width:25px;height:25px;border-radius:999px;background:var(--raised);color:var(--muted);font-size:12px;font-weight:800}
.filters{display:flex;gap:4px;margin:12px 0 1px;padding:3px;background:var(--raised);border-radius:9px;overflow-x:auto}
.filters button{flex:1;display:flex;align-items:center;justify-content:center;gap:4px;min-width:max-content;padding:5px 7px;border:0;border-radius:7px;background:transparent;color:var(--muted);font-size:10.5px;font-weight:700;cursor:pointer;white-space:nowrap}
.filters button:hover{color:var(--ink)}
.filters button[aria-selected="true"]{background:var(--surface);color:var(--ink);box-shadow:0 1px 3px rgba(40,54,24,.12)}
.filters button span{font-size:9px;opacity:.75}
.hint{margin:7px 0 10px;color:var(--muted);font-size:11.5px;line-height:1.35}
.events{display:flex;flex-direction:column;gap:5px;overflow:auto;padding-right:2px}
.event{display:flex;align-items:center;gap:9px;width:100%;padding:8px;border:1px solid transparent;border-radius:9px;background:transparent;text-align:left;cursor:pointer}
.event:hover{background:var(--raised);border-color:var(--line)}
.event.active{background:var(--deep);color:var(--bg);border-color:var(--deep)}
.marker{width:9px;height:9px;flex:none;border-radius:50%}
.event-copy{display:flex;min-width:0;flex:1;flex-direction:column;line-height:1.25}
.event-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
.event-meta,.event-coordinates{font-size:10.5px;color:var(--muted)}
.event.active .event-meta,.event.active .event-coordinates{color:#d8dfba}
.arrow{color:var(--muted);font-size:16px}
.event.active .arrow{color:var(--bg)}
.empty{margin:12px 2px 4px;font-size:12px}
@media (max-width:980px){
  .event-list{top:12px;left:auto;right:60px;width:min(280px,calc(100% - 76px));max-height:42vh}
}
</style>
