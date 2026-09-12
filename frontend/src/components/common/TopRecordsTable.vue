<script setup lang="ts">
/**
 * 年度大额记录。
 *
 * 用表格而不是图表：这是"某年最大的几笔"这类**离散清单**，
 * 柱状图除了长度之外读不出任何有效信息，还会浪费大量空间。
 *
 * ⚠️ 后端返回的 `topRecords` 是**数组**（每项自带 `year`），
 * 不是以年份为键的对象，因此必须用 find 而不是 `topRecords[year]`。
 */
import { computed, ref, watch } from 'vue'

import { useMediaQuery } from '@vueuse/core'

import type { TopRecordsByYear } from '@/types/analytics'
import { formatDateDisplay } from '@/utils/date'
import { formatMoney } from '@/utils/format'

const props = defineProps<{ items: TopRecordsByYear[] }>()

const year = ref<number | null>(null)

/** 窄屏隐藏"描述"列，保留日期、分类与金额。 */
const isNarrow = useMediaQuery('(max-width: 639px)')

// 默认选中最新的一年；数据变化时校正到仍存在的年份
watch(
  () => props.items,
  (list) => {
    if (list.length === 0) {
      year.value = null
      return
    }
    const years = list.map((item) => item.year)
    if (year.value === null || !years.includes(year.value)) {
      year.value = Math.max(...years)
    }
  },
  { immediate: true, deep: false },
)

const years = computed(() => props.items.map((item) => item.year).sort((a, b) => b - a))

/** ⚠️ 数组用 find，不是索引访问。 */
const current = computed(() => props.items.find((item) => item.year === year.value) ?? null)

const isEmpty = computed(() => props.items.length === 0)

type Row = TopRecordsByYear['topExpenses'][number]
const expenseRows = computed<Row[]>(() => current.value?.topExpenses ?? [])
const incomeRows = computed<Row[]>(() => current.value?.topIncomes ?? [])
</script>

<template>
  <section class="nb-card top-records">
    <header class="top-records__head">
      <div>
        <h3 class="top-records__title">年度大额记录</h3>
        <p class="top-records__subtitle">按年列出金额最高的支出与收入，用于回顾大额决策</p>
      </div>

      <el-select v-if="years.length > 0" v-model="year" class="top-records__year" size="small">
        <el-option v-for="y in years" :key="y" :label="`${y} 年`" :value="y" />
      </el-select>
    </header>

    <el-empty v-if="isEmpty" description="无" :image-size="70" />

    <div v-else class="top-records__grid">
      <div>
        <h4 class="top-records__sub">最大支出</h4>
        <el-table :data="expenseRows" size="small" stripe>
          <el-table-column label="日期" width="104">
            <template #default="{ row }">
              <span class="tabular">{{ formatDateDisplay(row.billDate) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="分类" min-width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.category }} / {{ row.subcategory }}</template>
          </el-table-column>
          <el-table-column v-if="!isNarrow" prop="description" label="描述" min-width="110" show-overflow-tooltip />
          <el-table-column label="金额" width="112" align="right">
            <template #default="{ row }">
              <span class="nb-amount--expense tabular">{{ formatMoney(row.amount) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div>
        <h4 class="top-records__sub">最大收入</h4>
        <el-table :data="incomeRows" size="small" stripe>
          <el-table-column label="日期" width="104">
            <template #default="{ row }">
              <span class="tabular">{{ formatDateDisplay(row.billDate) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="分类" min-width="110" show-overflow-tooltip>
            <template #default="{ row }">{{ row.category }} / {{ row.subcategory }}</template>
          </el-table-column>
          <el-table-column v-if="!isNarrow" prop="description" label="描述" min-width="110" show-overflow-tooltip />
          <el-table-column label="金额" width="112" align="right">
            <template #default="{ row }">
              <span class="nb-amount--income tabular">{{ formatMoney(row.amount) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </section>
</template>

<style scoped>
.top-records {
  padding: 1rem 1.125rem;
}

.top-records__head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.top-records__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.top-records__subtitle {
  margin: 0.125rem 0 0;
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.top-records__year {
  width: 7.5rem;
}

.top-records__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 26rem), 1fr));
}

.top-records__sub {
  margin: 0 0 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--nb-text-muted);
}
</style>
