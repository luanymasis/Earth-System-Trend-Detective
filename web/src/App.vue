<script setup>
import { onMounted } from 'vue'
import { useAppStore } from './stores/app.js'
import TopBar from './components/TopBar.vue'
import GlobeCanvas from './components/GlobeCanvas.vue'
import SidePanel from './components/SidePanel.vue'

const app = useAppStore()
onMounted(() => app.init())
</script>

<template>
  <div class="app">
    <TopBar />
    <div class="main">
      <GlobeCanvas />
      <SidePanel />
    </div>
  </div>
</template>

<style scoped>
.app{height:100%;display:grid;grid-template-rows:auto 1fr}
.main{display:grid;grid-template-columns:minmax(0,1fr) 410px;min-height:0}
@media (max-width:960px){ .app{height:auto} .main{grid-template-columns:minmax(0,1fr)} }
</style>
