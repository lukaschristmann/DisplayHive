<script setup lang="ts">
import { ref } from 'vue'
import Select from 'primevue/select'

const options = [
  { label: 'Aura', value: 'aura' },
  { label: 'Lara', value: 'lara' },
  { label: 'Material', value: 'material' },
  { label: 'Nora', value: 'nora' },
]

// Initialize immediately with localStorage value or fallback
const theme = ref<string>(
  (typeof localStorage !== 'undefined' && localStorage.getItem('primevue-theme')) || 'aura'
)

function applyTheme() {
  if (!theme.value) return
  localStorage.setItem('primevue-theme', theme.value)
  // reload to apply new theme preset via bootstrap
  window.location.reload()
}
</script>

<template>
  <div class="theme-switcher">
    <Select
      :options="options"
      v-model="theme"
      optionLabel="label"
      optionValue="value"
      @change="applyTheme"
      placeholder="Theme"
      style="min-width: 8rem"
    />
  </div>
</template>

<style scoped>
.theme-switcher {
  display: inline-flex;
  align-items: center;
}

/* Override PrimeVue dropdown styles for header visibility */
.theme-switcher :deep(.p-select) {
  background: rgba(255, 255, 255, 0.2) !important;
  border: 1px solid rgba(255, 255, 255, 0.5) !important;
  color: white !important;
}

.theme-switcher :deep(.p-select:hover) {
  background: rgba(255, 255, 255, 0.3) !important;
  border-color: rgba(255, 255, 255, 0.7) !important;
}

.theme-switcher :deep(.p-select .p-select-label) {
  color: white !important;
}

.theme-switcher :deep(.p-select .p-select-dropdown) {
  color: white !important;
}

.theme-switcher :deep(.p-select-overlay) {
  background: white !important;
  color: #333 !important;
}
</style>
