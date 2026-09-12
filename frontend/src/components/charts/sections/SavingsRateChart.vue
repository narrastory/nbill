<script setup lang="ts">
/**
 * 分年储蓄率。
 *
 * ⚠️ 数组是**按所选区间**把数据分年汇总的，首尾年份很可能不是完整年度。
 * 区间选 2026-09-01 ~ 2026-09-11 时，2026 那根柱只代表这 11 天。
 * 因此标题不敢写"年度储蓄率"（那是在断言整年），副标题也明确点出这一点。
 *
 * ⚠️ 不提供对数轴：储蓄率是百分比且可为负（入不敷出），
 * 对数轴无法表示 0 与负数，这里强行切换只会得到断线和空白。
 *
 * ⚠️ 某年收入为 0 时 savingsRate 为 `null`，必须断开并以「无」展示，
 * 不能补 0 —— 补 0 会被读成"储蓄率为 0%"，与"无法计算"完全不同。
 *
 * 同时给出收入与支出作为参考背景，但**不画在同一张图上**：
 * 金额（万级）与百分比（0~100）是两种量纲，同图必然要双轴，
 * 那是要避免的做法。这里只在 tooltip 里补充金额信息。
 */
import { computed } from 'vue'

import ChartCard from '../ChartCard.vue'
import { barSeriesStyle, categoryAxis, readChartTokens, valueAxis } from '../theme'
import type { EChartsOption } from '../echarts'
import type { FullAnalytics } from '@/types/analytics'
import { formatCount, formatMoney, formatNullablePercent } from '@/utils/format'

type SavingRateItem = FullAnalytics['bonus']['savingsRate'][number]

const props = defineProps<{ items: SavingRateItem[] }>()

const tokens = readChartTokens()

const sorted = computed(() => [...props.items].sort((a, b) => a.year - b.year))
const categories = computed(() => sorted.value.map((item) => String(item.year)))
const isEmpty = computed(() => sorted.value.length === 0)
const nullYears = computed(() => sorted.value.filter((item) => item.savingsRate === null).map((i) => i.year))

function formatter(params: unknown): string {
  const list = Array.isArray(params) ? params : [params]
  const first = list[0] as { dataIndex?: number } | undefined
  const item = first?.dataIndex !== undefined ? sorted.value[first.dataIndex] : undefined
  if (!item) return '无'

  return [
    `${item.year} 年`,
    `储蓄率：${formatNullablePercent(item.savingsRate, 1)}`,
    `收入：${formatMoney(item.totalIncome)}`,
    `支出：${formatMoney(item.totalExpense)}`,
  ].join('<br/>')
}

const option = computed<EChartsOption>(() => ({
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter },
  xAxis: categoryAxis(tokens, categories.value),
  yAxis: {
    ...valueAxis(tokens, { name: '储蓄率' }),
    axisLabel: {
      color: tokens.textMuted,
      fontSize: 11,
      formatter: (value: number) => (Number.isFinite(value) ? `${value}%` : ''),
    },
  },
  series: [
    {
      ...barSeriesStyle(tokens.palette[0]),
      name: '储蓄率',
      data: sorted.value.map((item) => ({
        // null 直接保留：ECharts 会跳过该柱而不是画在 0 上
        value: item.savingsRate,
        itemStyle: {
          color:
            item.savingsRate === null
              ? tokens.textSubtle
              : item.savingsRate >= 0
                ? tokens.palette[0]
                : tokens.expense,
        },
      })),
    },
  ],
}))

const subtitle = computed(() => {
  if (sorted.value.length === 0) return '无'
  const base =
    `${sorted.value.length} 个年份 · 按所选区间分年汇总，首尾年份可能是不完整年度 · ` +
    `收入为 0 时无法计算，显示为「无」而非 0%`
  return nullYears.value.length > 0 ? `${base}（${nullYears.value.join('、')} 年无收入）` : base
})

// 只用于说明每格代表什么，避免读者把柱高当成金额
const legendNote = computed(() => `共 ${formatCount(sorted.value.length)} 年`)
</script>

<template>
  <ChartCard
    title="各查询年份留存了多少收入"
    :subtitle="subtitle"
    :option="option"
    :empty="isEmpty"
    empty-text="无"
    empty-hint="当前区间没有可计算储蓄率的年度。"
    height="clamp(15rem, 30vh, 20rem)"
  >
    <template #actions-extra>
      <span class="savings-note">{{ legendNote }}</span>
    </template>
  </ChartCard>
</template>

<style scoped>
.savings-note {
  font-size: 0.75rem;
  color: var(--nb-text-subtle);
}
</style>
