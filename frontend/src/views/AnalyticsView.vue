<script setup lang="ts">
/**
 * 数据分析页。
 *
 * 数据源 `GET /analytics`，**只在进入本页时按需加载**，不在路由切换时调用。
 * store 内按 dateFrom..dateTo 缓存本次页面会话结果；写入流水后由
 * analyticsStore.invalidate() 清空，不会展示过期统计。
 *
 * 金额口径必须分开：普通收支（totalIncome/totalExpense/netIncome）、
 * 外部现金往来（externalIn/externalOut）、现金余额（opening/closing）是
 * 三套数，初始余额单独列示，绝不加进收入。
 */
import { computed, onMounted, ref } from 'vue'

import { ElMessage } from 'element-plus'

import AmountDistributionChart from '@/components/charts/sections/AmountDistributionChart.vue'
import CashTrendChart from '@/components/charts/sections/CashTrendChart.vue'
import CategoryChart from '@/components/charts/sections/CategoryChart.vue'
import DayOfWeekChart from '@/components/charts/sections/DayOfWeekChart.vue'
import FrequencyAmountChart from '@/components/charts/sections/FrequencyAmountChart.vue'
import MonthlySummaryChart from '@/components/charts/sections/MonthlySummaryChart.vue'
import MonthlyTrendsChart from '@/components/charts/sections/MonthlyTrendsChart.vue'
import ParetoChart from '@/components/charts/sections/ParetoChart.vue'
import SavingsRateChart from '@/components/charts/sections/SavingsRateChart.vue'
import TagAnalysisChart from '@/components/charts/sections/TagAnalysisChart.vue'
import AnomalyTable from '@/components/common/AnomalyTable.vue'
import DataState from '@/components/common/DataState.vue'
import MonthlySummaryTable from '@/components/common/MonthlySummaryTable.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import ReconciliationRail from '@/components/common/ReconciliationRail.vue'
import TopRecordsTable from '@/components/common/TopRecordsTable.vue'
import DateRangeBar from '@/components/layout/DateRangeBar.vue'
import { useAnalyticsStore } from '@/stores/analytics'
import { formatCompactMoney, formatMoney, formatNullablePercent } from '@/utils/format'

const analytics = useAnalyticsStore()

const range = ref<{ dateFrom?: string; dateTo?: string }>({})
const loaded = ref(false)
type AnalyticsTopic = 'cash' | 'income' | 'structure' | 'habits' | 'annual'
const activeTopic = ref<AnalyticsTopic>('cash')

const TOPICS: Array<{ value: AnalyticsTopic; label: string; description: string }> = [
  { value: 'cash', label: '现金', description: '余额如何形成，以及区间内的高低变化' },
  { value: 'income', label: '收支', description: '普通收入、支出与月度变化' },
  { value: 'structure', label: '消费结构', description: '钱主要花在哪里、每笔通常有多大' },
  { value: 'habits', label: '消费习惯', description: '时间、频次与异常消费模式' },
  { value: 'annual', label: '年度回顾', description: '年度储蓄率与大额记录' },
]

const data = computed(() => analytics.full)
const overview = computed(() => data.value?.basicStats.overview)
const extremes = computed(() => data.value?.basicStats.extremes)
const maxCash = computed(() => data.value?.basicStats.maxHistoricalCash)

/** 是否传了 dateFrom。决定「最高现金」的叫法与来源文案。 */
const isRangeQuery = computed(() => data.value?.period.dateFrom != null)

async function load(): Promise<void> {
  await analytics.loadFull(range.value)
  loaded.value = true
  if (analytics.fullError) ElMessage.error(analytics.fullError)
}

onMounted(() => {
  void load()
})

function handleRangeChange(next: { dateFrom?: string; dateTo?: string }): void {
  range.value = next
  // 换区间必须绕过缓存重新计算
  void analytics.loadFull(next, { force: true })
}

/** 现金余额的数据区间，供图表副标题使用。 */
const periodText = computed(() => {
  if (!data.value) return ''
  const { dateFrom, dateTo } = data.value.period
  return `${dateFrom ?? '最早'} ~ ${dateTo}`
})

/**
 * 区间储蓄率。
 *
 * ⚠️ **不能**取 `bonus.savingsRate[]` 的最后一项充当"当年储蓄率"：
 * 那个数组是把**当前查询区间内**的数据按年份汇总的。区间若选
 * 2026-09-01 ~ 2026-09-11，它的 2026 项只含这 11 天，写成"2026 年储蓄率"
 * 会严重误导。总览卡片回答的是"这个区间"，就直接按区间算。
 *
 * 口径：净收入 ÷ 普通收入。初始余额与外部现金流都不计入（硬约束）。
 * 分母为 0 时返回 null → 显示 `--`，绝不显示 0%。
 *
 * 年度口径仍由 SavingsRateChart 展示，那里的副标题会说明首尾年可能不完整。
 */
const periodSavingsRate = computed(() => {
  const item = overview.value
  if (!item || item.totalIncome <= 0) return null
  return (item.netIncome / item.totalIncome) * 100
})

/**
 * 「最高现金」的标题与来源说明必须随查询区间变化。
 *
 * 全量查询时它确实是历史最高；一旦传了 `dateFrom`，该字段只是**所选区间内**
 * 的最高每日结束余额。同理 `source === 'initialBalance'` 在区间查询下指的是
 * 区间开始前结转形成的 openingCashBalance，不一定是系统配置的初始余额。
 *
 * 另外同一天可能同时有普通流水与外部往来，`source` 只是后端为兼容单值字段
 * 而返回的当日来源之一，不能解释成精确的致峰原因 —— 因此文案用"含"而非"来自"。
 */
const maxCashTitle = computed(() => (isRangeQuery.value ? '区间最高现金' : '历史最高现金'))

const maxCashSourceText = computed(() => {
  switch (maxCash.value?.source) {
    case 'initialBalance':
      return isRangeQuery.value ? '最高值出现在区间期初' : '期初为初始余额'
    case 'transaction':
      return '最高余额日含普通流水'
    case 'externalTransaction':
      return '最高余额日含外部往来'
    default:
      return '--'
  }
})
</script>

<template>
  <div class="analytics">
    <PageHeader
      title="分析"
      description="先选择想回答的问题，再查看结论、趋势与明细。所有统计沿用后端返回口径。"
      :eyeline="data ? `统计区间 ${periodText}` : '财务回顾'"
    />

    <DateRangeBar :loading="analytics.fullLoading" @change="handleRangeChange" />

    <DataState
      :loading="analytics.fullLoading && !data"
      :error="analytics.fullError && !data ? analytics.fullError : null"
      :empty="false"
      :skeleton-rows="8"
      @retry="load"
    >
      <template v-if="overview">
        <section class="analytics__overview nb-data-surface" aria-label="分析总览">
          <div class="analytics__overview-grid">
          <article class="analytics__stat analytics__stat--closing">
            <p class="analytics__stat-label">期末现金</p>
            <p class="analytics__stat-value">{{ formatMoney(overview.closingCashBalance) }}</p>
            <p class="analytics__stat-hint">统计截止 {{ data?.period.dateTo }}</p>
          </article>
          <article class="analytics__stat">
            <p class="analytics__stat-label">普通净收入</p>
            <p
              class="analytics__stat-value"
              :class="overview.netIncome >= 0 ? 'nb-amount--income' : 'nb-amount--expense'"
            >
              {{ formatMoney(overview.netIncome) }}
            </p>
            <p class="analytics__stat-hint">
              收入 {{ formatCompactMoney(overview.totalIncome) }} ·
              支出 {{ formatCompactMoney(overview.totalExpense) }}
            </p>
          </article>
          <article class="analytics__stat">
            <p class="analytics__stat-label">外部净现金流</p>
            <p
              class="analytics__stat-value"
              :class="overview.externalNetCashFlow >= 0 ? 'nb-amount--income' : 'nb-amount--expense'"
            >
              {{ formatMoney(overview.externalNetCashFlow) }}
            </p>
            <p class="analytics__stat-hint">
              流入 {{ formatCompactMoney(overview.externalIn) }} ·
              流出 {{ formatCompactMoney(overview.externalOut) }}
            </p>
          </article>
          <article class="analytics__stat">
            <p class="analytics__stat-label">区间储蓄率</p>
            <p class="analytics__stat-value">{{ formatNullablePercent(periodSavingsRate, 1) }}</p>
            <p class="analytics__stat-hint">
              净收入 ÷ 普通收入，按当前查询区间计算（收入为 0 时无可比基数）·
              初始余额 {{ formatMoney(overview.initialBalance) }}（不计入收入）
            </p>
          </article>
          </div>
          <ReconciliationRail
            :opening="overview.openingCashBalance"
            :operating="overview.netIncome"
            :external="overview.externalNetCashFlow"
            :closing="overview.closingCashBalance"
            :date-to="data?.period.dateTo"
          />
        </section>

        <section class="analytics__extremes" aria-label="极值">
          <article class="analytics__extreme">
            <p class="analytics__stat-label">最大单笔支出</p>
            <p class="analytics__stat-value nb-amount--expense">
              {{ formatMoney(extremes?.maxExpense?.amount ?? null) }}
            </p>
            <p class="analytics__stat-hint">
              <template v-if="extremes?.maxExpense">
                {{ extremes.maxExpense.billDate }} · {{ extremes.maxExpense.category }} /
                {{ extremes.maxExpense.subcategory }}
              </template>
              <template v-else>--</template>
            </p>
          </article>

          <article class="analytics__extreme">
            <p class="analytics__stat-label">最大单笔收入</p>
            <p class="analytics__stat-value nb-amount--income">
              {{ formatMoney(extremes?.maxIncome?.amount ?? null) }}
            </p>
            <p class="analytics__stat-hint">
              <template v-if="extremes?.maxIncome">
                {{ extremes.maxIncome.billDate }} · {{ extremes.maxIncome.category }} /
                {{ extremes.maxIncome.subcategory }}
              </template>
              <template v-else>--</template>
            </p>
          </article>

          <article class="analytics__extreme">
            <p class="analytics__stat-label">{{ maxCashTitle }}</p>
            <p class="analytics__stat-value">{{ formatMoney(maxCash?.amount ?? null) }}</p>
            <p class="analytics__stat-hint">
              {{ maxCash?.date ?? '--' }} · {{ maxCashSourceText }}
            </p>
          </article>
        </section>

        <nav class="analytics__topics" aria-label="分析主题">
          <button
            v-for="topic in TOPICS"
            :key="topic.value"
            type="button"
            class="analytics__topic"
            :class="{ 'is-active': activeTopic === topic.value }"
            :aria-current="activeTopic === topic.value ? 'page' : undefined"
            @click="activeTopic = topic.value"
          >
            <span>{{ topic.label }}</span>
            <small>{{ topic.description }}</small>
          </button>
        </nav>

        <section v-if="activeTopic === 'cash'" class="analytics__topic-content" aria-label="现金分析">
          <header class="analytics__section-head">
            <h2>现金如何变化</h2>
            <p>期初结转、普通净收入与外部净现金流共同形成期末现金。</p>
          </header>
          <CashTrendChart :points="data?.cashBalanceTrend ?? []" />
        </section>

        <section v-else-if="activeTopic === 'income'" class="analytics__topic-content" aria-label="收支分析">
          <header class="analytics__section-head">
            <h2>每月收支是否改善</h2>
            <p>图表看趋势，明细表核对每月具体数字；不完整月份不会伪装成完整周期。</p>
          </header>
          <MonthlySummaryChart :months="data?.monthlySummary ?? []" />
          <MonthlySummaryTable
            :months="data?.monthlySummary ?? []"
            :loading="analytics.fullLoading && !data"
            subtitle="逐月核对普通收入、支出、餐饮结构、主动消费占比与平均每笔金额"
          />
          <MonthlyTrendsChart :trends="data?.bonus.monthlyTrends ?? []" />
        </section>

        <section v-else-if="activeTopic === 'structure'" class="analytics__topic-content" aria-label="消费结构">
          <header class="analytics__section-head">
            <h2>钱主要花在哪里</h2>
            <p>从分类集中度、单笔金额区间与标签三个角度理解消费结构。</p>
          </header>
          <div class="analytics__pair">
            <CategoryChart v-if="data" :analysis="data.categoryAnalysis" />
            <AmountDistributionChart
              v-if="data"
              :income="data.amountDistribution.income"
              :expense="data.amountDistribution.expense"
            />
          </div>
          <div class="analytics__pair">
            <ParetoChart :items="data?.bonus.pareto ?? []" />
            <TagAnalysisChart :items="data?.bonus.tagAnalysis ?? []" />
          </div>
        </section>

        <section v-else-if="activeTopic === 'habits'" class="analytics__topic-content" aria-label="消费习惯">
          <header class="analytics__section-head">
            <h2>消费习惯有什么规律</h2>
            <p>观察星期分布、频次与均额，并单独核对异常记录。</p>
          </header>
          <div class="analytics__pair">
            <DayOfWeekChart :days="data?.bonus.dayOfWeek ?? []" />
            <FrequencyAmountChart :items="data?.bonus.frequencyAmount ?? []" />
          </div>
          <AnomalyTable :items="data?.bonus.anomalies ?? []" />
        </section>

        <section v-else class="analytics__topic-content" aria-label="年度回顾">
          <header class="analytics__section-head">
            <h2>年度表现与重要记录</h2>
            <p>首尾年份可能只覆盖查询区间的一部分，储蓄率仍按普通收入口径计算。</p>
          </header>
          <SavingsRateChart :items="data?.bonus.savingsRate ?? []" />
          <TopRecordsTable :items="data?.bonus.topRecords ?? []" />
        </section>
      </template>
    </DataState>
  </div>
</template>

<style scoped>
.analytics {
  display: flex;
  flex-direction: column;
  gap: clamp(0.75rem, 2vw, 1rem);
}

.analytics__overview {
  padding: 1rem 1.125rem;
}

.analytics__overview-grid {
  display: grid;
  gap: 0;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));
}

.analytics__stat {
  min-width: 0;
  padding: 0.25rem 1rem 0.25rem 0;
  margin-right: 1rem;
  border-right: 1px solid var(--nb-border);
}

.analytics__stat:last-child {
  margin-right: 0;
  border-right: 0;
}

.analytics__stat-label {
  margin: 0 0 0.375rem;
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
}

.analytics__stat-value {
  margin: 0 0 0.25rem;
  font-size: clamp(1.125rem, 2.8vw, 1.375rem);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.analytics__stat-hint {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--nb-text-subtle);
}

.analytics__extremes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-block: 1px solid var(--nb-border);
}

.analytics__extreme {
  padding: 0.875rem 1rem;
  border-right: 1px solid var(--nb-border);
}

.analytics__extreme:last-child {
  border-right: 0;
}

.analytics__topics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  background: var(--nb-surface);
  border: 1px solid var(--nb-border);
  border-radius: var(--nb-radius-data);
}

.analytics__topic {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-height: 4rem;
  padding: 0.75rem 0.875rem;
  color: var(--nb-text-muted);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-right: 1px solid var(--nb-border);
}

.analytics__topic:last-child {
  border-right: 0;
}

.analytics__topic span {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--nb-text);
}

.analytics__topic small {
  overflow: hidden;
  font-size: 0.6875rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analytics__topic.is-active {
  box-shadow: inset 0 -3px 0 var(--nb-primary);
  background: var(--nb-primary-soft);
}

.analytics__topic-content {
  display: flex;
  flex-direction: column;
  gap: clamp(0.75rem, 2vw, 1rem);
}

.analytics__section-head {
  padding: 0.75rem 0 0.25rem;
}

.analytics__section-head h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.analytics__section-head p {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
}

/* 配对图表：宽屏并排，窄屏堆叠。
   用 minmax 保证每列不窄于 22rem，否则图表里的轴标签会挤在一起。 */
.analytics__pair {
  display: grid;
  gap: clamp(0.75rem, 2vw, 1rem);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
}

@media (max-width: 899px) {
  .analytics__topics {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
    scroll-snap-type: x proximity;
  }

  .analytics__topics::-webkit-scrollbar {
    display: none;
  }

  .analytics__topic {
    flex: 0 0 auto;
    min-width: 7.5rem;
    scroll-snap-align: start;
  }

  .analytics__extremes {
    grid-template-columns: 1fr;
  }

  .analytics__extreme,
  .analytics__extreme:last-child {
    border-right: 0;
    border-bottom: 1px solid var(--nb-border);
  }

  .analytics__extreme:last-child {
    border-bottom: 0;
  }
}

@media (max-width: 639px) {
  .analytics__overview-grid {
    grid-template-columns: 1fr 1fr;
  }

  .analytics__stat {
    padding-block: 0.625rem;
    border-bottom: 1px solid var(--nb-border);
  }

  .analytics__stat:nth-child(even) {
    margin-right: 0;
    border-right: 0;
  }
}
</style>
