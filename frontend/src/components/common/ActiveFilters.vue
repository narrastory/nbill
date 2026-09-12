<script setup lang="ts">
import type { FilterChip } from '@/utils/filterLabels'

defineProps<{ chips: FilterChip[] }>()
const emit = defineEmits<{ remove: [key: string]; clear: [] }>()
</script>

<template>
  <div v-if="chips.length > 0" class="active-filters" aria-label="已生效筛选">
    <span class="active-filters__label">已筛选</span>
    <el-tag
      v-for="chip in chips"
      :key="chip.key"
      closable
      effect="plain"
      class="active-filters__chip"
      @close="emit('remove', chip.key)"
    >
      {{ chip.label }}
    </el-tag>
    <button type="button" class="active-filters__clear" @click="emit('clear')">清除全部</button>
  </div>
</template>

<style scoped>
.active-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: center;
  min-height: 2.5rem;
  padding: 0.5rem 0;
}

.active-filters__label {
  margin-right: 0.125rem;
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.active-filters__chip {
  max-width: min(18rem, 70vw);
}

.active-filters__clear {
  min-height: 2.5rem;
  padding-inline: 0.5rem;
  font-size: 0.75rem;
  color: var(--nb-primary);
  cursor: pointer;
  background: transparent;
  border: 0;
}
</style>
