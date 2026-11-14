import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { loadManifest, loadVariable } from '../lib/loader.js'
import { km as kmBetween } from '../lib/names.js'

// Estado global (PLAN §7.7)
export const useAppStore = defineStore('app', {
  state: () => ({
    manifest: null,
    loadError: null,
    loading: false,
    variableId: null,
    variable: null, // datos cargados de la variable activa (markRaw: arrays grandes)
    vars: {}, // todas las variables ya cargadas, por id (para "Cambia junto con")
    mode: 'compare', // 'compare' | 'trend' | 'forecast' | 'whatif'
    yearA: null, // índice de año (0 = primer año)
    yearB: 0,
    yearAf: null, // valor fraccionario para la animación "Ver cómo cambió"
    horizon: 2030,
    warming: 1,
    zone: null, // { lat, lon, name }
    otherZone: null,
    tab: 'zone', // 'zone' | 'disc'
    discoverFilter: 'changes',
    discoverVar: '',
    showChart: false,
    view: { lon0: -78, lat0: 14, zoom: 1 }, // vista inicial; el renderer la mantiene durante la interacción
    playing: false, // animación "Ver cómo cambió"
    flyTarget: null // { lat, lon, zoom, atLeast?, t }: el globo vuela aquí cuando cambia
  }),
  getters: {
    variables: s => s.manifest?.variables ?? [],
    meta: s => s.manifest?.variables.find(v => v.id === s.variableId) ?? null,
    nyears: s => (s.manifest ? s.manifest.years[1] - s.manifest.years[0] + 1 : 0),
    synthetic: s => !!s.manifest?.synthetic,
    years: s => s.manifest?.years ?? [0, 0]
  },
  actions: {
    async init () {
      try {
        this.manifest = markRaw(await loadManifest())
        this.yearA = this.yearAf = this.nyears - 1
        if (!this.zone) this.zone = { lat: 10.5, lon: -85.4, name: 'Guanacaste, Costa Rica' }
        await this.setVariable(this.manifest.variables[0].id)
        this.loadAll()
      } catch (err) {
        this.loadError = err.message
      }
    },
    /** Carga en segundo plano el resto de variables (el panel de zona las compara). */
    async loadAll () {
      for (const m of this.manifest.variables) {
        if (this.vars[m.id]) continue
        try { this.keep(await loadVariable(m.id)) } catch { /* se reintenta al elegirla */ }
      }
    },
    keep (v) { if (!this.vars[v.meta.id]) this.vars = { ...this.vars, [v.meta.id]: markRaw(v) } },
    async setVariable (id) {
      this.variableId = id
      this.otherZone = null
      this.loading = true
      try {
        const v = await loadVariable(id)
        this.keep(v)
        if (this.variableId === id) this.variable = markRaw(v)
      } catch (err) {
        this.loadError = err.message
      } finally {
        if (this.variableId === id) this.loading = false
      }
    },
    setTab (tab) { this.tab = tab },
    setMode (mode) { this.stopPlay(); this.mode = mode },
    setYearA (t) {
      this.stopPlay()
      this.yearA = this.yearAf = t
      if (this.yearA <= this.yearB) this.yearB = Math.max(0, this.yearA - 1)
    },
    setYearB (t) {
      this.stopPlay()
      this.yearB = t
      if (this.yearA <= this.yearB) this.yearA = this.yearAf = Math.min(this.nyears - 1, this.yearB + 1)
    },
    togglePlay () {
      if (this.playing) { this.stopPlay(); return }
      if (this.yearA <= this.yearB + 1) this.yearA = this.nyears - 1
      this.yearAf = this.yearB + 1
      this.playing = true
    },
    stopPlay () {
      if (!this.playing) return
      this.playing = false
      this.yearAf = this.yearA
    },
    /** Avanza la animación (llamado en cada cuadro por el globo). */
    stepPlay (dt) {
      if (!this.playing) return
      const next = this.yearAf + dt * 2.2
      if (next >= this.yearA) { this.yearAf = this.yearA; this.playing = false } else this.yearAf = next
    },
    /**
     * Selecciona una zona y vuela a ella. Con `other`, marca ambas y encuadra el par.
     * zoom: zoom mínimo al que acercarse (no aleja si ya está más cerca).
     */
    selectZone (zone, { zoom = 1.8, other = null } = {}) {
      this.zone = zone
      this.otherZone = other
      this.tab = 'zone'
      if (other) {
        const lon = zone.lon + ((((other.lon - zone.lon) + 540) % 360) - 180) / 2
        const d = kmBetween(zone, other)
        this.flyTarget = { lat: (zone.lat + other.lat) / 2, lon, zoom: Math.max(1.2, Math.min(2.2, 4200 / Math.max(800, d))), t: Date.now() }
      } else {
        this.flyTarget = { lat: zone.lat, lon: zone.lon, zoom, atLeast: true, t: Date.now() }
      }
    }
  }
})
