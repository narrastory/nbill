<script setup lang="ts">
/**
 * 外部往来筛选栏。
 *
 * 「方向」用 IN / OUT 而不是"收/支"，避免与普通收支的收入/支出混淆 ——
 * 外部往来不计入经营收支，借出 500 是现金减少而不是消费。
 *
 * 往来类型与往来方必须来自后端字典；字段名是小写的
 * `Flowtype` / `Relatedparty`，与流水上的驼峰字段不同名，见
 * docs/FRONTEND_API.md 的外部往来接口章节。
 */
import { computed, reactive, ref, watch } from 'vue'

import { useDebounceFn } from '@vueuse/core'

import FilterPanel from './FilterPanel.vue'
import { useFilterValidation } from '@/composables/useFilterValidation'
import { useDictionaryStore } from '@/stores/dictionary'
import type { ExternalTransactionQuery } from '@/types/api'

const props = withDefaults(defineProps<{ loading?: boolean }>(), { loading: false })

const emit = defineEmits<{ search: [query: ExternalTransactionQuery] }>()

const dictionary = useDictionaryStore()
const { validateAmountRange, validateDateRange } = useFilterValidation()

const form = reactive({
  type: '' as '' | 'IN' | 'OUT',
  flowType: '',
  relatedParty: '',
  description: '',
  amountMin: '',
  amountMax: '',
  dateFrom: '',
  dateTo: '',
})

const defaultCollapsed = ref(
  typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches,
)

const activeCount = computed(
  () =>
    [
      form.type,
      form.flowType,
      form.relatedParty,
      form.description.trim(),
      form.amountMin,
      form.amountMax,
      form.dateFrom,
      form.dateTo,
    ].filter((value) => value !== '').length,
)

function buildQuery(): ExternalTransactionQuery | null {
  const query: ExternalTransactionQuery = {}

  if (form.type !== '') query.type = form.type
  if (form.flowType) query.flowType = form.flowType
  if (form.relatedParty) query.relatedParty = form.relatedParty
  const description = form.description.trim()
  if (description) query.description = description

  const amounts = validateAmountRange(form.amountMin, form.amountMax)
  if (amounts === null) return null
  Object.assign(query, amounts)

  const dates = validateDateRange(form.dateFrom, form.dateTo)
  if (dates === null) return null
  Object.assign(query, dates)

  return query
}

function search(): void {
  const query = buildQuery()
  if (query === null) return
  emit('search', query)
}

const debouncedSearch = useDebounceFn(search, 400)
watch(() => form.description, debouncedSearch)

function reset(): void {
  form.type = ''
  form.flowType = ''
  form.relatedParty = ''
  form.description = ''
  form.amountMin = ''
  form.amountMax = ''
  form.dateFrom = ''
  form.dateTo = ''
  emit('search', {})
}

function removeFilter(key: string): void {
  switch (key) {
    case 'type':
      form.type = ''
      break
    case 'flowType':
      form.flowType = ''
      break
    case 'relatedParty':
      form.relatedParty = ''
      break
    case 'description':
      form.description = ''
      break
    case 'amountMin':
      form.amountMin = ''
      break
    case 'amountMax':
      form.amountMax = ''
      break
    case 'dateFrom':
      form.dateFrom = ''
      break
    case 'dateTo':
      form.dateTo = ''
      break
  }
  search()
}

defineExpose({ removeFilter, reset })
</script>

<template>
  <FilterPanel
    :active-count="activeCount"
    :loading="props.loading"
    :default-collapsed="defaultCollapsed"
    @search="search"
    @reset="reset"
  >
    <label class="filter-field">
      <span class="filter-field__label">方向</span>
      <el-select v-model="form.type" placeholder="全部" clearable>
        <el-option label="流出（借出/垫付）" value="OUT" />
        <el-option label="流入（归还/收回）" value="IN" />
      </el-select>
    </label>

    <label class="filter-field">
      <span class="filter-field__label">往来类型</span>
      <el-select v-model="form.flowType" placeholder="全部" clearable filterable>
        <el-option
          v-for="name in dictionary.flowTypeNames"
          :key="name"
          :label="name"
          :value="name"
        />
      </el-select>
    </label>

    <label class="filter-field">
      <span class="filter-field__label">往来方</span>
      <el-select v-model="form.relatedParty" placeholder="全部" clearable filterable>
        <el-option
          v-for="name in dictionary.relatedPartyNames"
          :key="name"
          :label="name"
          :value="name"
        />
      </el-select>
    </label>

    <label class="filter-field filter-field--wide">
      <span class="filter-field__label">描述包含</span>
      <el-input v-model="form.description" placeholder="输入关键词，自动搜索" clearable />
    </label>

    <label class="filter-field">
      <span class="filter-field__label">金额下限</span>
      <el-input v-model="form.amountMin" inputmode="decimal" placeholder="不限" clearable>
        <template #prefix>¥</template>
      </el-input>
    </label>

    <label class="filter-field">
      <span class="filter-field__label">金额上限</span>
      <el-input v-model="form.amountMax" inputmode="decimal" placeholder="不限" clearable>
        <template #prefix>¥</template>
      </el-input>
    </label>

    <label class="filter-field">
      <span class="filter-field__label">开始日期</span>
      <el-date-picker
        v-model="form.dateFrom"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="不限"
        class="filter-field__control"
      />
    </label>

    <label class="filter-field">
      <span class="filter-field__label">结束日期</span>
      <el-date-picker
        v-model="form.dateTo"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="不限"
        class="filter-field__control"
      />
    </label>
  </FilterPanel>
</template>

<style scoped>
.filter-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.filter-field--wide {
  grid-column: span 2;
}

@media (max-width: 639px) {
  .filter-field--wide {
    grid-column: span 1;
  }
}

.filter-field__label {
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.filter-field :deep(.el-select),
.filter-field :deep(.el-input),
.filter-field__control {
  width: 100%;
}
</style>
