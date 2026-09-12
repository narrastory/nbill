<script setup lang="ts">
/**
 * 仪表盘。
 *
 * 数据源**只用**轻量的 `GET /analytics/summary`（手册建议），
 * 不在首页调用计算量大的完整 `/analytics`。
 *
 * 月表曾经为了"首页也要有明细"而在这里自动触发完整分析 —— 那等于为了
 * 一张首页表格把分析页的全部图表数据集都算一遍，与"完整分析按需加载"
 * 的设计目标冲突。现在月表只保留在数据分析页（与月度收支图构成
 * 「趋势 + 明细」配对），首页只承担概览职责。
 *
 * 展示口径必须分开，不能混：
 *  - 期末现金 = 期初现金 + 普通净收入 + 外部净现金流；
 *  - 初始余额单独列示，绝不加进收入；
 *  - 所有百分比为 null 时显示 `--`。
 */
import { computed, onMounted } from 'vue'

import DailyThought from '@/components/dashboard/DailyThought.vue'
import DataState from '@/components/common/DataState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import ReconciliationRail from '@/components/common/ReconciliationRail.vue'
import lifeThoughts from '@/assets/data/Life-Thought.json'
import { useAnalyticsStore } from '@/stores/analytics'
import { selectDailyThought, type LifeThought } from '@/utils/dailyThought'
import { formatMoney, formatNullablePercent } from '@/utils/format'

const analytics = useAnalyticsStore()
const today = new Date()
const dailyThought = selectDailyThought(lifeThoughts as LifeThought[], today)

const summary = computed(() => analytics.summary)

const isReconciled = computed(() => {
  const item = summary.value
  if (!item) return false
  const calculated =
    item.cash.openingCashBalance + item.operating.netIncome + item.external.netCashFlow
  return Math.abs(calculated - item.cash.closingCashBalance) < 0.005
})

onMounted(() => {
  void analytics.loadSummary()
})

/**
 * 条形宽度按"相对最大值"计算，而不是直接用 percent。
 *
 * percent 是占总支出的比例，量级很小（最大的分类也只有百分之十几），
 * 若直接用它做宽度，所有条形都会缩成一小截、彼此无法区分。
 * 因此宽度按列表内最大值归一化，真实百分比仍以文本展示（口径不变）。
 */
const maxCategoryAmount = computed(() =>
  Math.max(0, ...(summary.value?.topExpenseCategories ?? []).map((item) => item.amount)),
)

function barWidth(amount: number): string {
  if (maxCategoryAmount.value <= 0) return '0%'
  return `${Math.min(100, Math.max(0, (amount / maxCategoryAmount.value) * 100))}%`
}
</script>

<template>
  <div class="dashboard">
    <PageHeader
      title="概览"
      description="先核对现金，再查看本期主要支出与未结清往来。"
      :eyeline="summary ? `统计至 ${summary.period.dateTo}` : '私人账本'"
    />

    <DataState
      :loading="analytics.summaryLoading && !summary"
      :error="analytics.summaryError"
      :empty="false"
      :skeleton-rows="6"
      @retry="analytics.loadSummary()"
    >
      <template v-if="summary">
        <section class="cash-hero nb-data-surface" aria-label="现金概览">
          <div class="cash-hero__topline">
            <div>
              <p class="cash-hero__label">期末现金余额</p>
              <p class="cash-hero__value">{{ formatMoney(summary.cash.closingCashBalance) }}</p>
            </div>
            <span class="cash-hero__status" :class="{ 'is-ok': isReconciled }">
              {{ isReconciled ? '现金关系已核对' : '现金关系待检查' }}
            </span>
          </div>
          <ReconciliationRail
            :opening="summary.cash.openingCashBalance"
            :operating="summary.operating.netIncome"
            :external="summary.external.netCashFlow"
            :closing="summary.cash.closingCashBalance"
            :date-to="summary.period.dateTo"
          />
        </section>

        <div class="dashboard__secondary">
          <section class="nb-data-surface panel">
          <h2 class="panel__title">钱主要花在哪里</h2>
          <p class="panel__subtitle">
            占期间总支出的比例 · 期间 {{ summary.period.dateFrom ?? '最早' }} ~
            {{ summary.period.dateTo }}
          </p>

          <DataState :empty="summary.topExpenseCategories.length === 0" empty-text="期间内没有支出记录">
            <ul class="ranking">
              <li
                v-for="(item, index) in summary.topExpenseCategories"
                :key="item.category"
                class="ranking__row"
              >
                <span class="ranking__index">{{ index + 1 }}</span>
                <span class="ranking__name">{{ item.category }}</span>
                <span class="ranking__bar" aria-hidden="true">
                  <span class="ranking__bar-fill" :style="{ width: barWidth(item.amount) }"></span>
                </span>
                <span class="ranking__amount tabular">{{ formatMoney(item.amount) }}</span>
                <span class="ranking__percent tabular">
                  {{ formatNullablePercent(item.percent) }}
                </span>
              </li>
            </ul>
          </DataState>
          </section>

          <section class="nb-data-surface outstanding-card">
            <div>
              <p class="outstanding-card__label">未结清往来</p>
              <p class="outstanding-card__value nb-amount--expense">
                {{ formatMoney(summary.external.outstandingAmount) }}
              </p>
              <p class="outstanding-card__hint">仅统计已关联业务组中尚未收回的部分。</p>
            </div>
            <RouterLink class="outstanding-card__link" :to="{ name: 'external' }">
              查看往来业务组
            </RouterLink>
          </section>
        </div>
      </template>
    </DataState>

    <DailyThought v-if="dailyThought" :thought="dailyThought" :date="today" />
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: clamp(0.75rem, 2vw, 1.25rem);
}

.cash-hero {
  padding: clamp(1.25rem, 3vw, 2rem);
  background:
    linear-gradient(90deg, var(--nb-primary) 0 0.25rem, transparent 0.25rem),
    var(--nb-surface);
}

.cash-hero__topline {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
}

.cash-hero__label {
  margin: 0 0 0.375rem;
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
}

.cash-hero__value {
  margin: 0;
  font-size: clamp(1.875rem, 5vw, 2.5rem);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
}

.cash-hero__status {
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  color: var(--nb-warning);
  background: color-mix(in srgb, var(--nb-warning) 10%, transparent);
  border-radius: 999px;
}

.cash-hero__status.is-ok {
  color: var(--nb-income);
  background: color-mix(in srgb, var(--nb-income) 10%, transparent);
}

.dashboard__secondary {
  display: grid;
  gap: clamp(0.75rem, 2vw, 1rem);
  grid-template-columns: minmax(0, 1.65fr) minmax(15rem, 0.75fr);
}

.outstanding-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 1.125rem 1.25rem;
}

.outstanding-card__label,
.outstanding-card__hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
}

.outstanding-card__value {
  margin: 0.5rem 0 0.375rem;
  font-size: clamp(1.375rem, 3vw, 1.75rem);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.outstanding-card__link {
  align-self: flex-start;
  margin-top: 1.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--nb-primary);
  text-decoration: none;
}

.panel {
  padding: 1.125rem 1.25rem;
}

.panel__title {
  margin: 0 0 0.25rem;
  font-size: 1rem;
  font-weight: 600;
}

.panel__subtitle {
  margin: 0 0 1rem;
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
}

.ranking {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.ranking__row {
  display: grid;
  gap: 0.625rem;
  align-items: center;
  grid-template-columns: 1.5rem minmax(4rem, 8rem) 1fr auto auto;
}

.ranking__index {
  display: grid;
  place-items: center;
  width: 1.25rem;
  height: 1.25rem;
  font-size: 0.6875rem;
  color: var(--nb-text-muted);
  background-color: var(--color-ink-100);
  border-radius: 0.375rem;
}

.ranking__name {
  overflow: hidden;
  font-size: 0.875rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ranking__bar {
  height: 0.5rem;
  overflow: hidden;
  background-color: var(--color-ink-100);
  border-radius: 999px;
}

.ranking__bar-fill {
  display: block;
  height: 100%;
  background: var(--nb-primary);
  border-radius: inherit;
}

.ranking__amount {
  font-size: 0.875rem;
  font-weight: 500;
}

.ranking__percent {
  min-width: 3.75rem;
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
  text-align: right;
}

/* 窄屏：隐藏比例条，保留名称与金额 */
@media (max-width: 639px) {
  .dashboard__secondary {
    grid-template-columns: 1fr;
  }

  .ranking__row {
    grid-template-columns: 1.5rem 1fr auto;
  }

  .ranking__bar,
  .ranking__percent {
    display: none;
  }
}
</style>
