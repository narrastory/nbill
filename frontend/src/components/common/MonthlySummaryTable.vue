<script setup lang="ts">
/**
 * 月度收支明细表（月表）。
 *
 * 数据源是 `GET /analytics` 的 `monthlySummary`。这张表回答的是图表答不了的问题：
 * 具体某个月的餐饮花了多少、非餐饮多少、主动消费多少、平均每笔多少。
 * 图表看趋势，表格看数字，两者互补而不是二选一。
 *
 * 筛选 / 排序 / 分页的**全部逻辑在 utils/monthlyTable.ts 的纯函数里**，
 * 本组件只负责渲染与事件转发，因此那部分可以直接单测。
 *
 * 界面在仪表盘与分析页复用，两边行为完全一致。
 */
import { computed, ref, watch } from 'vue'

import { useMediaQuery } from '@vueuse/core'

import DataState from '@/components/common/DataState.vue'
import type { MonthlySummary } from '@/types/analytics'
import { formatCount, formatMoney, formatNullablePercent } from '@/utils/format'
import {
  selectMonthlyRows,
  type MonthlySortKey,
  type SortOrder,
} from '@/utils/monthlyTable'

const props = withDefaults(
  defineProps<{
    months: MonthlySummary[]
    loading?: boolean
    title?: string
    subtitle?: string
  }>(),
  {
    loading: false,
    title: '月度收支明细',
    subtitle: '',
  },
)

const PAGE_SIZES = [12, 24, 36, 60]

const year = ref<number | null>(null)
const sortKey = ref<MonthlySortKey>('yearMonth')
const sortOrder = ref<SortOrder>('desc')
const page = ref(1)
const pageSize = ref(12)

const isNarrow = useMediaQuery('(max-width: 899px)')

const result = computed(() =>
  selectMonthlyRows(props.months, {
    year: year.value,
    sortKey: sortKey.value,
    sortOrder: sortOrder.value,
    page: page.value,
    pageSize: pageSize.value,
  }),
)

// 筛选后总页数会变，请求的页码可能越界；纯函数会把页码收敛，
// 这里把它写回分页器，否则分页器会停在已经不存在的页上。
watch(
  () => result.value.page,
  (effective) => {
    if (effective !== page.value) page.value = effective
  },
)

const isEmpty = computed(() => !props.loading && result.value.total === 0)

/**
 * 表头三态排序：升序 → 降序 → 取消。
 * 取消时回到默认的"按月份降序"，而不是保持最后一次排序 —— 否则
 * 用户点了两下之后无法回到最初的视图。
 */
function handleSortChange(payload: { prop: string | null; order: string | null }): void {
  if (!payload.order || !payload.prop) {
    sortKey.value = 'yearMonth'
    sortOrder.value = 'desc'
  } else {
    sortKey.value = payload.prop as MonthlySortKey
    sortOrder.value = payload.order === 'ascending' ? 'asc' : 'desc'
  }
  page.value = 1
}

function handleYearChange(next: number | null): void {
  year.value = next
  // 换年份必须回到第一页，否则容易落在空页
  page.value = 1
}

function handleSizeChange(size: number): void {
  pageSize.value = size
  page.value = 1
}

/** 筛选后这几个月的小计，给标题行一个抓手。 */
const subtotal = computed(() => {
  const rows = result.value.rows
  if (rows.length === 0) return null
  return {
    income: rows.reduce((sum, row) => sum + row.totalIncome, 0),
    expense: rows.reduce((sum, row) => sum + row.totalExpense, 0),
    net: rows.reduce((sum, row) => sum + row.netProfit, 0),
  }
})

const subtitleText = computed(() => {
  if (props.subtitle) return props.subtitle
  const { total } = result.value
  const years = result.value.years.length
  return total === 0
    ? '暂无月度数据'
    : `共 ${total} 个月 · 覆盖 ${years} 个年份 · 点表头可排序，按年份可筛选`
})

/** 窄屏隐藏的明细列，优先保住月份与三个主要金额。 */
const showDetailColumns = computed(() => !isNarrow.value)
</script>

<template>
  <section class="nb-card month-table">
    <header class="month-table__head">
      <div class="month-table__titles">
        <h3 class="month-table__title">{{ title }}</h3>
        <p class="month-table__subtitle">{{ subtitleText }}</p>
      </div>

      <!-- 当前页小计，让读者一眼知道这批月份的量级 -->
      <div v-if="subtotal" class="month-table__subtotal">
        <span>本页小计</span>
        <strong class="nb-amount--income">{{ formatMoney(subtotal.income) }}</strong>
        <span class="month-table__sep">/</span>
        <strong class="nb-amount--expense">{{ formatMoney(subtotal.expense) }}</strong>
        <span class="month-table__sep">/</span>
        <strong :class="subtotal.net >= 0 ? 'nb-amount--income' : 'nb-amount--expense'">
          {{ formatMoney(subtotal.net) }}
        </strong>
      </div>
    </header>

    <!-- 年份快捷筛选 -->
    <div class="month-table__years" role="group" aria-label="按年份筛选">
      <button
        type="button"
        class="month-table__year"
        :class="{ 'is-active': year === null }"
        @click="handleYearChange(null)"
      >
        全部
      </button>
      <button
        v-for="item in result.years"
        :key="item"
        type="button"
        class="month-table__year"
        :class="{ 'is-active': year === item }"
        @click="handleYearChange(item)"
      >
        {{ item }}
      </button>
    </div>

    <DataState :loading="loading" :empty="isEmpty" empty-text="该年份没有月度数据">
      <el-table
        :data="result.rows"
        stripe
        size="small"
        :default-sort="{ prop: 'yearMonth', order: 'descending' }"
        @sort-change="handleSortChange"
      >
        <el-table-column prop="yearMonth" label="月份" width="98" sortable="custom">
          <template #default="{ row }">
            <span class="tabular month-table__month">{{ row.yearMonth }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="totalIncome" label="总收入" width="118" align="right" sortable="custom">
          <template #default="{ row }">
            <span class="nb-amount--income tabular">{{ formatMoney(row.totalIncome) }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="totalExpense" label="总支出" width="118" align="right" sortable="custom">
          <template #default="{ row }">
            <span class="nb-amount--expense tabular">{{ formatMoney(row.totalExpense) }}</span>
          </template>
        </el-table-column>

        <el-table-column prop="netProfit" label="净结余" width="118" align="right" sortable="custom">
          <template #default="{ row }">
            <span
              class="tabular"
              :class="row.netProfit >= 0 ? 'nb-amount--income' : 'nb-amount--expense'"
            >
              {{ formatMoney(row.netProfit) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column prop="frequency" label="笔数" width="80" align="center" sortable="custom">
          <template #default="{ row }">
            <span class="tabular">{{ formatCount(row.frequency) }}</span>
          </template>
        </el-table-column>

        <template v-if="showDetailColumns">
          <el-table-column
            prop="foodExpense"
            label="餐饮支出"
            min-width="106"
            align="right"
            sortable="custom"
          >
            <template #default="{ row }">
              <span class="tabular">{{ formatMoney(row.foodExpense) }}</span>
            </template>
          </el-table-column>

          <el-table-column
            prop="nonFoodExpense"
            label="非餐饮支出"
            min-width="116"
            align="right"
            sortable="custom"
          >
            <template #default="{ row }">
              <span class="tabular">{{ formatMoney(row.nonFoodExpense) }}</span>
            </template>
          </el-table-column>

          <el-table-column
            prop="activeChoiceExpense"
            label="主动消费"
            min-width="106"
            align="right"
            sortable="custom"
          >
            <template #default="{ row }">
              <span class="tabular">{{ formatMoney(row.activeChoiceExpense) }}</span>
            </template>
          </el-table-column>

          <el-table-column
            prop="avgPerExpense"
            label="均笔金额"
            min-width="106"
            align="right"
            sortable="custom"
          >
            <template #default="{ row }">
              <span class="tabular">{{ formatMoney(row.avgPerExpense) }}</span>
            </template>
          </el-table-column>

          <el-table-column label="餐饮占比" min-width="96" align="right">
            <template #default="{ row }">
              <!-- 支出为 0 的月份占比无意义，显示 -- 而不是 0% -->
              <span class="tabular month-table__ratio">
                {{
                  formatNullablePercent(
                    row.totalExpense > 0 ? (row.foodExpense / row.totalExpense) * 100 : null,
                    1,
                  )
                }}
              </span>
            </template>
          </el-table-column>
        </template>
      </el-table>

      <footer class="month-table__footer">
        <el-pagination
          :current-page="page"
          :page-size="pageSize"
          :page-sizes="PAGE_SIZES"
          :total="result.total"
          :layout="isNarrow ? 'prev, pager, next' : 'total, sizes, prev, pager, next, jumper'"
          :pager-count="isNarrow ? 5 : 7"
          background
          @current-change="(value: number) => (page = value)"
          @size-change="handleSizeChange"
        />
      </footer>
    </DataState>
  </section>
</template>

<style scoped>
.month-table {
  padding: 1rem 1.125rem;
}

.month-table__head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.month-table__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.month-table__subtitle {
  margin: 0.125rem 0 0;
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.month-table__subtotal {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  align-items: baseline;
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.month-table__subtotal strong {
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
}

.month-table__sep {
  color: var(--nb-text-subtle);
}

.month-table__years {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3125rem;
  margin-bottom: 0.75rem;
}

.month-table__year {
  padding: 0.25rem 0.6875rem;
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
  cursor: pointer;
  background-color: var(--color-ink-100);
  border: 0;
  border-radius: 999px;
  transition:
    background-color var(--duration-fast) var(--ease-out-soft),
    color var(--duration-fast) var(--ease-out-soft);
}

.month-table__year:hover {
  color: var(--nb-text);
  background-color: var(--color-ink-200);
}

.month-table__year.is-active {
  font-weight: 600;
  color: #ffffff;
  background-color: var(--nb-primary);
}

.month-table__month {
  font-weight: 500;
}

.month-table__ratio {
  color: var(--nb-text-muted);
}

.month-table__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.75rem;
}

@media (max-width: 639px) {
  .month-table__subtotal {
    display: none;
  }
}
</style>
