<script setup lang="ts">
/**
 * 普通收支筛选栏。
 *
 * 交互约定（手册 FRONTEND_GUIDE「分页、筛选和排序」）：
 *  - 下拉、日期等离散条件点「查询」后生效；
 *  - 描述输入额外做 400ms 防抖，边打边搜；
 *  - 发请求前必须本地校验：日期格式与先后顺序、金额有限且上下限有序；
 *  - 筛选条件变化后由父组件把页码重置为 1。
 */
import { computed, reactive, ref, watch } from 'vue'

import { useDebounceFn } from '@vueuse/core'

import FilterPanel from './FilterPanel.vue'
import { useFilterValidation } from '@/composables/useFilterValidation'
import { useDictionaryStore } from '@/stores/dictionary'
import type { TransactionQuery } from '@/types/api'
import type { TransactionType } from '@/types/models'

const props = withDefaults(
  defineProps<{ loading?: boolean; initial?: TransactionQuery }>(),
  { loading: false, initial: () => ({}) },
)

const emit = defineEmits<{ search: [query: TransactionQuery] }>()

const dictionary = useDictionaryStore()
const { validateAmountRange, validateDateRange } = useFilterValidation()

const form = reactive({
  type: undefined as TransactionType | undefined,
  category: '',
  subcategory: '',
  tag: '',
  description: '',
  amountMin: '',
  amountMax: '',
  dateFrom: '',
  dateTo: '',
})

/** 窄屏默认折叠，避免筛选栏占满首屏；宽屏默认展开。 */
const defaultCollapsed = ref(
  typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches,
)

/** 有没有任一条件生效，用于折叠时提示。 */
const activeCount = computed(
  () =>
    [
      form.type,
      form.category,
      form.subcategory,
      form.tag,
      form.description.trim(),
      form.amountMin,
      form.amountMax,
      form.dateFrom,
      form.dateTo,
    ].filter((value) => value !== undefined && value !== null && value !== '').length,
)

const categoryOptions = computed(() =>
  form.type ? dictionary.categoryNames(form.type) : Array.from(new Set(dictionary.categories.map((c) => c.Category))),
)

const subcategoryOptions = computed(() => {
  if (!form.category) return []
  const types: TransactionType[] = form.type ? [form.type] : ['Income', 'Expense']
  const names = new Set<string>()
  for (const type of types) {
    for (const name of dictionary.subcategories(type, form.category)) names.add(name)
  }
  return Array.from(names)
})

/** 标签候选：未选类型时给全部，选了类型按 AppliesTo 过滤。 */
const tagOptions = computed(() => {
  const source = form.type ? dictionary.tagsForType(form.type) : dictionary.tags
  return source.map((tag) => tag.Tag)
})

// 类型变化后原分类/子分类可能不再适用
watch(
  () => form.type,
  () => {
    if (form.category && !categoryOptions.value.includes(form.category)) {
      form.category = ''
      form.subcategory = ''
    }
    if (form.tag && !tagOptions.value.includes(form.tag)) {
      form.tag = ''
    }
  },
)

watch(
  () => form.category,
  () => {
    if (form.subcategory && !subcategoryOptions.value.includes(form.subcategory)) {
      form.subcategory = ''
    }
  },
)

/** 把表单转成查询参数；空值一律省略，不发送空字符串。 */
function buildQuery(): TransactionQuery | null {
  const query: TransactionQuery = {}

  if (form.type) query.type = form.type
  if (form.category) query.category = form.category
  if (form.subcategory) query.subcategory = form.subcategory
  if (form.tag) query.tag = form.tag
  const description = form.description.trim()
  if (description) query.description = description

  // 金额与日期区间的校验规则两个列表页共用。
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

// 描述做防抖，避免每敲一个字都请求一次
const debouncedSearch = useDebounceFn(search, 400)
watch(() => form.description, debouncedSearch)

function reset(): void {
  form.type = undefined
  form.category = ''
  form.subcategory = ''
  form.tag = ''
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
      form.type = undefined
      break
    case 'category':
      form.category = ''
      form.subcategory = ''
      break
    case 'subcategory':
      form.subcategory = ''
      break
    case 'tag':
      form.tag = ''
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
      <span class="filter-field__label">类型</span>
      <el-select v-model="form.type" placeholder="全部" clearable>
        <el-option label="支出" value="Expense" />
        <el-option label="收入" value="Income" />
      </el-select>
    </label>

    <label class="filter-field">
      <span class="filter-field__label">一级分类</span>
      <el-select v-model="form.category" placeholder="全部" clearable filterable>
        <el-option v-for="name in categoryOptions" :key="name" :label="name" :value="name" />
      </el-select>
    </label>

    <label class="filter-field">
      <span class="filter-field__label">二级分类</span>
      <el-select
        v-model="form.subcategory"
        placeholder="全部"
        clearable
        filterable
        :disabled="!form.category"
      >
        <el-option v-for="name in subcategoryOptions" :key="name" :label="name" :value="name" />
      </el-select>
    </label>

    <label class="filter-field">
      <span class="filter-field__label">标签</span>
      <el-select v-model="form.tag" placeholder="全部" clearable filterable>
        <el-option v-for="name in tagOptions" :key="name" :label="name" :value="name" />
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

/* el-select / el-date-picker 默认宽度不撑满栅格单元 */
.filter-field :deep(.el-select),
.filter-field :deep(.el-input),
.filter-field__control {
  width: 100%;
}
</style>
