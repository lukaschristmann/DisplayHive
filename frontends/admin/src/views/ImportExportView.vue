<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useAuthStore } from '../stores/auth'

import Card from 'primevue/card'
import Button from 'primevue/button'
import ProgressBar from 'primevue/progressbar'
import Message from 'primevue/message'

const toast = useToast()
const confirm = useConfirm()
const authStore = useAuthStore()

const exporting = ref(false)
const importing = ref(false)
const importResult = ref<{ success: boolean; error?: string; counts?: Record<string, number> } | null>(null)

const triggerExport = async () => {
  exporting.value = true
  try {
    const response = await fetch('/admin/export/download', { headers: authStore.authHeader() })
    if (!response.ok) throw new Error(`Server error: ${response.status}`)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const cd = response.headers.get('Content-Disposition') || ''
    const match = cd.match(/filename="?([^"]+)"?/)
    a.download = match?.[1] ?? 'displayhive-export.zip'
    a.href = url
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.add({ severity: 'success', summary: 'Export Complete', detail: 'Database and media exported as ZIP file.', life: 3000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Export Failed', detail: String(e), life: 5000 })
  } finally {
    exporting.value = false
  }
}

const fileInput = ref<HTMLInputElement | null>(null)

const triggerImport = () => {
  confirm.require({
    message:
      'This will permanently DELETE all existing data and media files, then replace them with the contents of the selected file. Media files are deleted immediately and cannot be recovered even if the import fails. This cannot be undone. Continue?',
    header: 'Confirm Import',
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'Cancel',
    acceptLabel: 'Import',
    acceptClass: 'p-button-danger',
    accept: () => {
      fileInput.value?.click()
    },
  })
}

const onFileSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''

  importResult.value = null
  importing.value = true

  try {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch('/admin/import/upload', {
      method: 'POST',
      headers: authStore.authHeader(),
      body: formData,
    })
    const result = await response.json()
    importResult.value = result
    if (result.success) {
      toast.add({ severity: 'success', summary: 'Import Complete', detail: 'Database imported successfully.', life: 4000 })
    } else {
      toast.add({ severity: 'error', summary: 'Import Failed', detail: result.error || 'Unknown error', life: 6000 })
    }
  } catch (e) {
    importResult.value = { success: false, error: String(e) }
    toast.add({ severity: 'error', summary: 'Import Failed', detail: String(e), life: 6000 })
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="importexport-view">
    <!-- Export -->
    <Card class="section-card">
      <template #title>
        <div class="card-header">
          <i class="pi pi-upload" style="margin-right: 0.5rem" />
          <span>Export Database</span>
        </div>
      </template>
      <template #content>
        <p class="description">
          Export the entire database (screens, content, devices, templates, …) together with all
          media files as a single ZIP archive. The archive contains <code>db.json</code> (database
          snapshot) and a <code>media/</code> folder with the actual files.
        </p>
        <Button
          label="Download Export"
          icon="pi pi-download"
          :loading="exporting"
          :disabled="exporting"
          @click="triggerExport"
        />
      </template>
    </Card>

    <!-- Import -->
    <Card class="section-card">
      <template #title>
        <div class="card-header">
          <i class="pi pi-download" style="margin-right: 0.5rem" />
          <span>Import Database</span>
        </div>
      </template>
      <template #content>
        <p class="description">
          Import a previously exported ZIP archive. <strong>All existing data and media files will be replaced.</strong>
          Legacy JSON-only exports are also accepted.
        </p>

        <!-- hidden file input -->
        <input
          ref="fileInput"
          type="file"
          accept=".zip,application/zip,.json,application/json"
          style="display: none"
          @change="onFileSelected"
        />

        <Button
          label="Select ZIP or JSON File…"
          icon="pi pi-folder-open"
          severity="danger"
          outlined
          :loading="importing"
          :disabled="importing"
          @click="triggerImport"
        />

        <ProgressBar v-if="importing" mode="indeterminate" style="margin-top: 1rem; height: 6px" />

        <!-- Result message -->
        <div v-if="importResult" style="margin-top: 1rem">
          <Message v-if="importResult.success" severity="success" :closable="false">
            Import successful!
            <ul v-if="importResult.counts" style="margin: 0.5rem 0 0 1rem; padding: 0">
              <li v-for="(count, key) in importResult.counts" :key="key">
                {{ key }}: {{ count }}
              </li>
            </ul>
          </Message>
          <Message v-else severity="error" :closable="false">
            Import failed: {{ importResult.error }}
          </Message>
        </div>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.importexport-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 700px;
}

.section-card {
  width: 100%;
}

.card-header {
  align-items: center;
}

.description {
  margin-bottom: 1rem;
  color: var(--text-color-secondary);
}
</style>
