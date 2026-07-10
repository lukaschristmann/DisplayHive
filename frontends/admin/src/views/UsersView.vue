<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useSocket } from '../composables/useSocket'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'
import { useAuthStore } from '../stores/auth'
import type { AdminUser } from '../types/models'

import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Dialog from 'primevue/dialog'
import Card from 'primevue/card'
import ToggleSwitch from 'primevue/toggleswitch'
import Message from 'primevue/message'

const toast = useToast()
const confirm = useConfirm()
const authStore = useAuthStore()
const { on, off, emit, emitWithAck } = useSocket()

const users = ref<AdminUser[]>([])
const loading = ref(true)

const showDialog = ref(false)
const isNew = ref(false)
const isSaving = ref(false)
const form = ref<{ id: number | null; username: string; password: string }>({
  id: null,
  username: '',
  password: '',
})

const handleUsers = (data: { users?: AdminUser[] }) => {
  users.value = data?.users || []
  loading.value = false
}

onMounted(() => {
  on('displayhive:admin:users:stc:users', handleUsers)
  emit('displayhive:admin:users:cts:get_users')
})

onUnmounted(() => {
  off('displayhive:admin:users:stc:users', handleUsers)
})

const openCreateDialog = () => {
  isNew.value = true
  form.value = { id: null, username: '', password: '' }
  showDialog.value = true
}

const openEditDialog = (user: AdminUser) => {
  isNew.value = false
  form.value = { id: user.id, username: user.username, password: '' }
  showDialog.value = true
}

const save = async () => {
  if (!form.value.username.trim()) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Username is required', life: 4000 })
    return
  }
  if (isNew.value && form.value.password.length < 8) {
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: 'Password must be at least 8 characters',
      life: 4000,
    })
    return
  }

  isSaving.value = true
  try {
    const event = isNew.value
      ? 'displayhive:admin:users:cts:create_user'
      : 'displayhive:admin:users:cts:update_user'
    const payload: Record<string, unknown> = { username: form.value.username.trim() }
    if (isNew.value) {
      payload.password = form.value.password
    } else {
      payload.id = form.value.id
      if (form.value.password) payload.password = form.value.password
    }

    const result = await emitWithAck<{ success: boolean; error?: string }>(event, payload)
    if (result.success) {
      toast.add({
        severity: 'success',
        summary: 'Success',
        detail: isNew.value ? 'User created' : 'User updated',
        life: 3000,
      })
      showDialog.value = false
      emit('displayhive:admin:users:cts:get_users')
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: result.error || 'Save failed', life: 5000 })
    }
  } finally {
    isSaving.value = false
  }
}

const toggleActiveUser = async (user: AdminUser, val: boolean) => {
  const previous = user.is_active
  user.is_active = val
  const result = await emitWithAck<{ success: boolean; error?: string }>(
    'displayhive:admin:users:cts:set_active',
    { id: user.id, is_active: val },
  )
  if (result.success) {
    toast.add({
      severity: 'success',
      summary: 'Updated',
      detail: `User ${user.username} ${val ? 'activated' : 'deactivated'}`,
      life: 2000,
    })
  } else {
    user.is_active = previous
    toast.add({ severity: 'error', summary: 'Error', detail: result.error || 'Update failed', life: 5000 })
  }
}

const deleteUser = (user: AdminUser) => {
  confirm.require({
    message: `Are you sure you want to delete user "${user.username}"? This cannot be undone.`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    acceptClass: 'p-button-danger',
    accept: async () => {
      const result = await emitWithAck<{ success: boolean; error?: string }>(
        'displayhive:admin:users:cts:delete_user',
        { id: user.id },
      )
      if (result.success) {
        toast.add({ severity: 'success', summary: 'Deleted', detail: 'User deleted', life: 3000 })
        emit('displayhive:admin:users:cts:get_users')
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: result.error || 'Delete failed', life: 5000 })
      }
    },
  })
}

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString() : '—')
</script>

<template>
  <div class="users-view">
    <Message severity="warn" :closable="false" class="users-warning">
      User management is not yet in a stable state. Currently, every admin
      account has full administrative rights and can add or remove other
      users.
    </Message>

    <Card>
      <template #title>
        <div class="card-header">
          <span>Admin Users</span>
          <Button label="Add User" icon="pi pi-plus" @click="openCreateDialog" />
        </div>
      </template>
      <template #content>
        <DataTable :value="users" :loading="loading" data-key="id" responsive-layout="scroll">
          <Column field="username" header="Username" sortable />
          <Column field="is_active" header="Active" style="width: 6rem">
            <template #body="{ data }">
              <ToggleSwitch
                :model-value="data.is_active"
                @update:model-value="(val: boolean) => toggleActiveUser(data, val)"
              />
            </template>
          </Column>
          <Column field="created_at" header="Created">
            <template #body="{ data }">{{ formatDate(data.created_at) }}</template>
          </Column>
          <Column field="last_login_at" header="Last Login">
            <template #body="{ data }">{{ formatDate(data.last_login_at) }}</template>
          </Column>
          <Column header="Actions" style="width: 10rem">
            <template #body="{ data }">
              <Button
                icon="pi pi-pencil"
                text
                rounded
                severity="secondary"
                @click="openEditDialog(data)"
              />
              <Button
                icon="pi pi-trash"
                text
                rounded
                severity="danger"
                :disabled="data.username === authStore.username && users.length <= 1"
                @click="deleteUser(data)"
              />
            </template>
          </Column>
        </DataTable>
      </template>
    </Card>

    <Dialog
      v-model:visible="showDialog"
      :header="isNew ? 'Add User' : 'Edit User'"
      modal
      style="width: 26rem"
    >
      <div class="dialog-form">
        <label for="user-username">Username</label>
        <InputText id="user-username" v-model="form.username" autofocus />

        <label for="user-password">
          {{ isNew ? 'Password' : 'New Password (leave blank to keep current)' }}
        </label>
        <Password id="user-password" v-model="form.password" :feedback="false" toggle-mask />
      </div>

      <template #footer>
        <Button label="Cancel" text @click="showDialog = false" />
        <Button label="Save" icon="pi pi-check" :loading="isSaving" @click="save" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.users-warning {
  margin-bottom: 1rem;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dialog-form {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.dialog-form label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color-secondary);
  margin-top: 0.5rem;
}

.dialog-form :deep(.p-password),
.dialog-form :deep(input) {
  width: 100%;
}
</style>
