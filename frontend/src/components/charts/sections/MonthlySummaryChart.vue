<script setup lang="ts">
/**
 * 月度收支。
 *
 * 收入、支出、净损益**都是人民币金额**，共用同一根数值轴 —— 单轴，不是双轴。
 * 实测 62 个月，必须提供 dataZoom。
 *
 * 收入/支出用语义色（收入绿、支出红），净损益用中性蓝：
 * 收支方向是极性语义，不是任意分类，所以不套用分类调色板的顺序色。
 */
import { computed } from 'vue'

import ChartCard from '../ChartCard.vue'
import { barSeriesStyle, categoryAxis, lineSeriesStyle, readChartTokens, valueAxis } from '../theme'
import type { EChartsOption } from '../echarts'
import { useLogScale, useZoomPreset } from '@/composables/useChartPreferences'
import type { MonthlySummary } from '@/types/analytics'
import {
  createTooltipFormatter,
  hasRenderableValues,
  toLogSafeData,
} from '@/utils/chart'
import { formatMoney } from '@/utils/format'

const props = defineProps<{ months: MonthlySummary[] }>()

const tokens = readChartTokens()
const { logScale } = useLogScale('monthly-summary')
const { preset, startValueFor } = useZoomPreset()

const categories = computed(() => props.months.map((item) => item.yearMonth))
const isEmpty = computed(() => props.months.length === 0)

const option = computed<EChartsOption>(() => {
  const income = props.months.map((item) => item.totalIncome)
  const expense = props.months.map((item) => item.totalExpense)
  const net = props.months.map((item) => item.netProfit)

  // 对数轴不能表示 <= 0；净损益常为负，因此在对数模式下也一并降级。
  const map = (values: number[]) =>
    logScale.value ? toLogSafeData(values).data : values

  const allValues = [...income, ...expense]
  const hasPositive = hasRenderableValues(allValues)

  const neutralTrend = tokens.palette[7] ?? tokens.primaryDeep
  const netLine = {
    ...lineSeriesStyle(tokens, neutralTrend, props.months.length),
    name: '净损益',
    data: map(net),
    itemStyle: { color: neutralTrend },
    lineStyle: { width: 2, color: neutralTrend },
  }

  return {
    tooltip: {
      trigger: 'axis',
      // 统一兜底：空值显示「无」，绝不出现 NaN/undefined
      formatter: createTooltipFormatter(formatMoney),
    },
    xAxis: categoryAxis(tokens, categories.value, true),
    yAxis: valueAxis(tokens, {
      log: logScale.value,
      name: logScale.value ? '金额（对数）' : '金额',
      hasRenderableData: hasPositive,
    }),
    series: [
      { ...barSeriesStyle(tokens.income), name: '收入', data: map(income) },
      { ...barSeriesStyle(tokens.expense), name: '支出', data: map(expense) },
      netLine,
    ],
  }
})

const subtitle = computed(() => {
  const base = `共 ${props.months.length} 个月`
  return logScale.value
    ? `${base} · 对数轴下非正数值（含负的净损益）不可表示，已断开显示`
    : `${base} · 收支与净损益同为金额，共用一根数值轴`
})
</script>

<template>
  <ChartCard
    title="每月收入与支出"
    :subtitle="subtitle"
    :option="option"
    :empty="isEmpty"
    empty-text="无"
    empty-hint="当前区间没有月度数据。"
    show-log-toggle
    v-model:log-scale="logScale"
    show-zoom
    v-model:zoom-preset="preset"
    with-zoom
    :zoom-start-value="startValueFor(categories)"
    height="clamp(18rem, 36vh, 26rem)"
  />
</template>
