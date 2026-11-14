import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { loadManifest, loadVariable } from '../lib/loader.js'

// Estado global (PLAN §7.7)
export const useAppStore = defineStore('app', {
  state: () => ({
    manifest: null,
    loadError: null,
    loading: false,
    variableId: null,
    variable: null, // datos cargados de la variable activa (markRaw: arrays grandes)
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
    view: { lon0: -78, lat0: 14, zoom: 1 }
  }),
  getters: {
    variables: s => s.manifest?.variables ?? [],
    meta: s => s.manifest?.variables.find(v => v.id === s.variableId) ?? null,
    nyears: s => (s.manifest ? s.manifest.years[1] - s.manifest.years[0] + 1 : 0),
    synthetic: s => !!s.manifest?.synthetic
  },
  actions: {
    async init () {
      try {
        this.manifest = markRaw(await loadManifest())
        this.yearA = this.yearAf = this.nyears - 1
        await this.setVariable(this.manifest.variables[0].id)
      } catch (err) {
        this.loadError = err.message
      }
    },
    async setVariable (id) {
      this.variableId = id
      this.otherZone = null
      this.loading = true
      try {
        const v = await loadVariable(id)
        if (this.variableId === id) this.variable = markRaw(v)
      } catch (err) {
        this.loadError = err.message
      } finally {
        if (this.variableId === id) this.loading = false
      }
    },
    setTab (tab) { this.tab = tab }
  }
})
