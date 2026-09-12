<script setup lang="ts">
/**
 * 星期消费。
 *
 * 后端只统计 Expense、不统计 Income，`dayOfWeek` 为 0~6 对应周日至周六。
 * 七个类目量级接近，不需要对数轴或 dataZoom。
 */
import { computed } from 'vue'

import ChartCard from '../ChartCard.vue'
import { barSeriesStyle, categoryAxis, readChartTokens, valueAxis } from '../theme'
import type { EChartsOption } from '../echarts'
import type { DayOfWeekStat } from '@/types/analytics'
import { createTooltipFormatter } from '@/utils/chart'
import { formatMoney } from '@/utils/format'

const props = defineProps<{ days: DayOfWeekStat[] }>()

const tokens = readChartTokens()

/** 按 0~6 排序，避免后端顺序变化导致横轴错位。 */
const sorted = computed(() => [...props.days].sort((a, b) => a.dayOfWeek - b.dayOfWeek))
const categories = computed(() => sorted.value.map((item) => item.dayName))
const isEmpty = computed(() => sorted.value.length === 0)

/** 找出消费最高的一天，用于强调。 */
const peakIndex = computed(() => {
  let max = -1
  let index = -1
  sorted.value.forEach((item, i) => {
    if (item.expenseAmount > max) {
      max = item.expenseAmount
      index = i
    }
  })
  return index
})

const option = computed<EChartsOption>(() => ({
  tooltip: {
    trigger: 'axis',
    formatter: createTooltipFormatter(formatMoney),
  },
  xAxis: categoryAxis(tokens, categories.value),
  yAxis: valueAxis(tokens, { name: '支出金额' }),
  series: [
    {
      ...barSeriesStyle(tokens.palette[0]),
      name: '支出金额',
      data: sorted.value.map((item, index) => ({
        value: item.expenseAmount,
        // 峰值用同一色系更深的一档强调。
        // 不用红色：所有柱子本就是支出，单独染红会被读成"另一类"。
        itemStyle: {
          color: index === peakIndex.value ? tokens.primaryDeep : tokens.palette[0],
        },
      })),
    },
  ],
}))

const subtitle = computed(() => {
  if (sorted.value.length === 0) return '只统计支出，不含收入'
  const peak = sorted.value[peakIndex.value]
  return peak
    ? `只统计支出（不含收入）· 最高为${peak.dayName} ${formatMoney(peak.expenseAmount)}（${peak.expenseCount} 笔）`
    : '只统计支出，不含收入'
})
</script>

<template>
  <ChartCard
    title="一周中哪天花得多"
    :subtitle="subtitle"
    :summary="subtitle"
    :option="option"
    :empty="isEmpty"
    empty-text="无"
    empty-hint="当前区间没有支出记录。"
    height="clamp(14rem, 28vh, 19rem)"
  />
</template>
