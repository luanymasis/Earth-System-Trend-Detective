import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { loadManifest, loadEventSeries, loadLayer, peekLayer, layerDescs } from '../lib/loader.js'
import { km } from '../lib/names.js'

// Estado global de Pulso Verde (Fase 3 §6).
export const useAppStore = defineStore('app', {
  state: () => ({
    manifest: null,
    loadError: null,
    variableId: 'tree',
    eventId: null,
    yearF: 0, // año fraccionario (índice desde years[0]) que muestra el globo
    playing: false,
    tab: 'event', // 'event' | 'news' | 'sim'
    sim: { act: 'deforestacion', M: 20, regen: true },
    series: {}, // events/{id}.json por id (markRaw)
    layers: [], // capas (FieldSource) visibles de la variable activa (markRaw)
    layersLoading: false,
    view: { lon0: -62, lat0: -12, zoom: 1.6 }, // vista inicial; el renderer la mantiene durante la interacción
    flyTarget: null // { lat, lon, zoom, t }
  }),
  getters: {
    variables: s => s.manifest?.variables ?? [],
    events: s => s.manifest?.events ?? [],
    meta: s => s.manifest?.variables.find(v => v.id === s.variableId) ?? null,
    ev: s => s.manifest?.events.find(e => e.id === s.eventId) ?? null,
    years: s => s.manifest?.years ?? [0, 0],
    nyears: s => (s.manifest ? s.manifest.years[1] - s.manifest.years[0] + 1 : 0),
    synthetic: s => !!s.manifest?.synthetic,
    /** Índice del año del evento seleccionado. */
    te () { return this.ev ? this.ev.year - this.years[0] : 0 },
    /** Línea base del globo: los 3 años previos al evento seleccionado (baseWin del prototipo). */
    baseWin () { const te = this.te; return [Math.max(0, te - 3), Math.max(0, te - 1)] },
    year () { return this.years[0] + Math.round(this.yearF) }
  },
  actions: {
    async init () {
      try {
        this.manifest = markRaw(await loadManifest())
        // ?var=precip&ev=borneo&tab=news (enlaces directos para la demo y las capturas)
        const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')
        if (this.manifest.variables.some(v => v.id === q.get('var'))) this.variableId = q.get('var')
        if (!this.manifest.variables.some(v => v.id === this.variableId)) this.variableId = this.manifest.variables[0].id
        if (['event', 'news', 'sim'].includes(q.get('tab'))) this.tab = q.get('tab')
        const first = this.manifest.events.find(e => e.id === q.get('ev')) ?? this.manifest.events[0]
        this.selectEvent(first.id)
        this.loadAllSeries()
      } catch (err) {
        this.loadError = err.message
      }
    },
    /** Carga en segundo plano las series de todos los eventos (Simular aprende de todos). */
    async loadAllSeries () {
      await Promise.all(this.manifest.events.map(async ev => {
        try {
          const s = await loadEventSeries(ev)
          if (!this.series[ev.id]) this.series = { ...this.series, [ev.id]: markRaw(s) }
        } catch (err) { console.warn(err.message) }
      }))
    },
    setVariable (id) { this.variableId = id; this.refreshLayers() },
    /** Capas visibles: las del evento seleccionado (se cargan) + las de otros eventos ya cargadas. */
    async refreshLayers () {
      const M = this.manifest, ev = this.ev, id = this.variableId
      if (!M || !ev) return
      const mine = layerDescs(M, id, ev)
      const others = M.events.filter(e => e !== ev).flatMap(e => layerDescs(M, id, e)).filter(d => !mine.some(m => m.file === d.file))
      const assemble = () => {
        const all = [...mine, ...others].map(peekLayer).filter(Boolean)
        // teselas antes que la capa global
        all.sort((a, b) => Number(a.wrap) - Number(b.wrap))
        this.layers = markRaw(all)
      }
      assemble()
      this.layersLoading = true
      try {
        await Promise.all(mine.map(d => loadLayer(d, this.nyears)))
      } catch (err) {
        console.warn(err.message)
      } finally {
        if (this.variableId === id && this.ev === ev) { assemble(); this.layersLoading = false }
      }
    },
    selectEvent (id) {
      const ev = this.manifest.events.find(e => e.id === id)
      if (!ev) return
      this.eventId = id
      this.stopPlay()
      this.yearF = Math.min(this.nyears - 1, ev.year - this.years[0] + 1)
      if (this.tab !== 'news') this.tab = 'event'
      const c = ev.ctrl ?? ev
      const lon = ev.lon + ((((c.lon - ev.lon) + 540) % 360) - 180) / 2
      const zoom = Math.max(1.4, Math.min(2.6, 3200 / Math.max(600, km(ev, c))))
      this.flyTarget = { lat: (ev.lat + c.lat) / 2, lon, zoom, t: Date.now() }
      this.refreshLayers()
    },
    setTab (tab) { this.tab = tab },
    setYear (t) { this.stopPlay(); this.yearF = t },
    togglePlay () {
      if (this.playing) { this.stopPlay(); return }
      if (this.yearF >= this.nyears - 1) this.yearF = Math.max(0, this.te - 3)
      this.playing = true
    },
    stopPlay () { this.playing = false },
    /** Avanza la reproducción (llamado en cada cuadro por el globo). */
    stepPlay (dt) {
      if (!this.playing) return
      const next = this.yearF + dt * 1.5
      if (next >= this.nyears - 1) { this.yearF = this.nyears - 1; this.playing = false } else this.yearF = next
    }
  }
})
