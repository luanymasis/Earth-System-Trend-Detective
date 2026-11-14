<script setup>
import { computed } from 'vue'
import { useAppStore } from '../stores/app.js'
import { gradCSS } from '../lib/colors.js'
import CompareControl from './controls/CompareControl.vue'
import TrendControl from './controls/TrendControl.vue'
import ForecastControl from './controls/ForecastControl.vue'
import WhatIfControl from './controls/WhatIfControl.vue'

const app = useAppStore()
const meta = computed(() => app.variable.meta)
const control = computed(() => ({ compare: CompareControl, trend: TrendControl, forecast: ForecastControl, whatif: WhatIfControl })[app.mode])
</script>

<template>
  <div class="ctl">
    <component :is="control">
      <template #legend>
        <div class="legend" :aria-label="`Escala de color: de ${meta.low} a ${meta.high}`">
          <span>{{ meta.low }}</span><span class="g" :style="{ background: gradCSS(meta.palette) }"></span><span>{{ meta.high }}</span>
        </div>
      </template>
    </component>
  </div>
</template>

<style scoped>
.ctl{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);width:min(760px,calc(100% - 28px));background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:10px 14px;box-shadow:0 4px 18px rgba(40,54,24,.1);display:flex;flex-direction:column;gap:8px}
.legend{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);flex-wrap:wrap}
.legend .g{flex:1;min-width:140px;max-width:300px;height:10px;border-radius:5px;border:1px solid var(--line)}
:deep(.ctlrow){display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:14px}
:deep(.note){font-size:12px;color:var(--muted)}
:deep(select){font:inherit;font-size:14px;font-weight:600;color:var(--ink);background:var(--raised);border:1px solid var(--line);border-radius:8px;padding:5px 8px}
@media (max-width:560px){ .ctl{padding:8px 10px;gap:6px} :deep(.note){display:none} }
</style>
