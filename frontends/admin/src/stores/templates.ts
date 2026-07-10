import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useSocket } from '../composables/useSocket'
import { unwrapEntity } from '../utils/entity'
import type { Template } from '../types/models'

export const useTemplatesStore = defineStore('templates', () => {
  const { on, emit } = useSocket()

  const templates = ref<Template[]>([])
  const loading = ref(false)

  type RawTemplateJsonApi = {
    id: string | number
    attributes: {
      name?: string
      description?: string
      html?: string
      css?: string
      is_default?: boolean
      isDefault?: boolean
      container_count?: number
      containers_count?: number
    }
  }

  type RawTemplateFlat = {
    id?: string | number
    name?: string
    title?: string
    description?: string
    html?: string
    css?: string
    is_default?: boolean
    isDefault?: boolean
    container_count?: number
    containers_count?: number
  }

  type RawTemplate = RawTemplateJsonApi | RawTemplateFlat

  function normalizeTemplate(item: RawTemplate): Template {
    try {
      const r = unwrapEntity(item as RawTemplateFlat)
      return {
        id: Number(r.id || 0),
        name: r.name || r.title || String(r.id || ''),
        description: r.description || '',
        html: r.html || '',
        css: r.css || '',
        is_default: !!(r.is_default || r.isDefault),
        container_count: r.container_count || r.containers_count || 0,
      }
    } catch {
      return { id: 0, name: 'unknown', description: '', html: '', css: '', is_default: false, container_count: 0 }
    }
  }

  const handleList = (data: { templates?: RawTemplate[]; data?: RawTemplate[] }) => {
    const arr = data?.templates || data?.data || []
    templates.value = arr.map(normalizeTemplate)
    loading.value = false
  }

  on('displayhive:admin:stc:templates_list', handleList)
  on('displayhive:admin:stc:upd_templates', handleList)

  const fetch = () => {
    loading.value = true
    emit('displayhive:admin:cts:get_templates')
  }

  // Dropdown options for views that only need id+name (e.g. Screens rename dialog)
  const asOptions = computed(() => [
    { id: null as number | null, name: 'System Default', isDefault: false },
    ...templates.value.map((t) => ({
      id: t.id as number | null,
      name: t.is_default ? `${t.name} (Default)` : t.name,
      isDefault: t.is_default || false,
    })),
  ])

  return { templates, loading, fetch, asOptions }
})
