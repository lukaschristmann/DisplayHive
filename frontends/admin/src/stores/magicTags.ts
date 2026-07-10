import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useSocket } from '../composables/useSocket'
import type { MagicTag } from '../types/models'

export const useMagicTagsStore = defineStore('magicTags', () => {
  const { on, emit } = useSocket()

  const magicTags = ref<MagicTag[]>([])
  const loading = ref(false)

  const handleList = (data: { data?: MagicTag[] }) => {
    magicTags.value = data?.data || []
    loading.value = false
  }

  on('displayhive:admin:stc:upd_magic_tags', handleList)

  const fetch = () => {
    loading.value = true
    emit('displayhive:admin:cts:get_magic_tags')
  }

  return { magicTags, loading, fetch }
})
