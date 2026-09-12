<script setup lang="ts">
/**
 * 环比与同比。
 *
 * 四个系列都是百分比，共用一根 0 轴，因此是单轴。
 *
 * ⚠️ 本系列**不提供对数轴**：对数轴无法表示负的百分比，而环比/同比
 * 大量为负；且百分比跨不过一个数量级，对数没有收益。
 *
 * ⚠️ 百分比可能为 `null`。后端要求当前月与对比月都是**完整自然月**，
 * 所以 null 有三类原因：对比月份不存在、对比月份分母为 0、当前月或对比月
 * 不完整。前端无法只凭该字段区分，文案必须把三种可能都说到。
 * 图上保持 `null` 并断开折线，**不能补 0** —— 补 0 会伪造出"持平"的假趋势。
 */
import { computed } from 'vue'

import ChartCard from '../ChartCard.vue'
import { categoryAxis, lineSeriesStyle, readChartTokens, valueAxis } from '../theme'
import type { EChartsOption } from '../echarts'
import { useZoomPreset } from '@/composables/useChartPreferences'
import type { MonthlyTrend } from '@/types/analytics'
import { createTooltipFormatter } from '@/utils/chart'
import { formatSignedPercent } from '@/utils/format'

const props = defineProps<{ trends: MonthlyTrend[] }>()

const tokens = readChartTokens()
const { preset, startValueFor } = useZoomPreset()

const categories = computed(() => props.trends.map((item) => item.yearMonth))
const isEmpty = computed(() => props.trends.length === 0)

/**
 * 统计有多少处不可比较，用于副标题。
 *
 * 文案刻意**不写**"无可比基数"：后端要求对比月是完整自然月，因此 null
 * 也可能是"月份不完整"造成的，而不仅仅是基数为 0。前端区分不了是哪一种。
 */
const NULL_HINT = '不可比较（月份不完整、缺少对比期或基数为 0）'

const nullCount = computed(
  () =>
    props.trends.filter((item) =>
      [item.incomeMoM, item.expenseMoM, item.incomeYoY, item.expenseYoY].some((v) => v === null),
    ).length,
)

const SERIES = [
  { key: 'incomeMoM', name: '收入环比', colorIndex: 1 },
  { key: 'expenseMoM', name: '支出环比', colorIndex: 2 },
  { key: 'incomeYoY', name: '收入同比', colorIndex: 7 },
  { key: 'expenseYoY', name: '支出同比', colorIndex: 3 },
] as const

const option = computed<EChartsOption>(() => ({
  tooltip: {
    trigger: 'axis',
    // 百分比为 null 时显示「无」，绝不显示 NaN% 或 0%
    formatter: createTooltipFormatter(formatSignedPercent),
  },
  xAxis: categoryAxis(tokens, categories.value, true),
  yAxis: {
    ...valueAxis(tokens, { name: '变化率' }),
    axisLabel: {
      color: tokens.textMuted,
      fontSize: 11,
      formatter: (value: number) => (Number.isFinite(value) ? `${value}%` : ''),
    },
  },
  series: SERIES.map((item) => ({
    ...lineSeriesStyle(tokens, tokens.palette[item.colorIndex] ?? tokens.palette[0], props.trends.length),
    name: item.name,
    data: props.trends.map((row) => row[item.key]),
    itemStyle: { color: tokens.palette[item.colorIndex] ?? tokens.palette[0] },
    lineStyle: { width: 2, color: tokens.palette[item.colorIndex] ?? tokens.palette[0] },
  })),
}))

const subtitle = computed(() => {
  const total = props.trends.length
  return nullCount.value > 0
    ? `${total} 个月 · ${nullCount.value} 个月存在${NULL_HINT}（显示为「无」并在图上断开，未按 0 处理）`
    : `${total} 个月 · 均可比较`
})
</script>

<template>
  <ChartCard
    title="收支变化趋势"
    :subtitle="subtitle"
    :option="option"
    :empty="isEmpty"
    empty-text="无"
    empty-hint="当前区间没有足够的数据计算变化率。"
    show-zoom
    v-model:zoom-preset="preset"
    with-zoom
    :zoom-start-value="startValueFor(categories)"
    height="clamp(16rem, 32vh, 22rem)"
  />
</template>
