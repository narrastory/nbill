<script setup lang="ts">
/**
 * 分类分析（一级分类金额排行）。
 *
 * 实测分类金额差可达两个数量级（房租房贷 7.7 万 vs 其它支出几百），
 * 因此提供对数轴。
 *
 * 因为是排行，采用**横向条形**：类目名是中文，横向排列不需要旋转，
 * 窄屏下也不会互相遮挡。
 */
import { computed } from 'vue'

import ChartCard from '../ChartCard.vue'
import { barSeriesStyle, readChartTokens, valueAxis } from '../theme'
import type { EChartsOption } from '../echarts'
import { useLogScale } from '@/composables/useChartPreferences'
import type { CategoryAnalysis } from '@/types/analytics'
import type { TransactionType } from '@/types/models'
import { createTooltipFormatter, hasRenderableValues, toLogSafeData } from '@/utils/chart'
import { formatMoney } from '@/utils/format'

const props = defineProps<{ analysis: CategoryAnalysis }>()

const tokens = readChartTokens()
const { logScale } = useLogScale('category')

const type = defineModel<TransactionType>('type', { default: 'Expense' })

/** 取当前收支类型的一级分类，按金额降序。 */
const rows = computed(() =>
  props.analysis.byCategory
    .filter((item) => item.type === type.value)
    .slice()
    .sort((a, b) => a.totalAmount - b.totalAmount),
)

const isEmpty = computed(() => rows.value.length === 0)

const option = computed<EChartsOption>(() => {
  const amounts = rows.value.map((item) => item.totalAmount)
  const values = logScale.value ? toLogSafeData(amounts).data : amounts
  const color = type.value === 'Expense' ? tokens.expense : tokens.income

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      // 空值一律显示「无」，绝不出现 NaN/undefined
      formatter: createTooltipFormatter(formatMoney),
    },
    // 横向条形：类目轴在 y，数值轴在 x
    xAxis: valueAxis(tokens, {
      log: logScale.value,
      name: logScale.value ? '金额（对数）' : '金额',
      hasRenderableData: hasRenderableValues(amounts),
    }),
    yAxis: {
      type: 'category',
      data: rows.value.map((item) => item.name),
      axisLine: { show: true, lineStyle: { color: tokens.border } },
      axisTick: { show: false },
      axisLabel: { color: tokens.textMuted, fontSize: 11, width: 90, overflow: 'truncate' },
    },
    grid: { left: 8, right: 24, top: 32, bottom: 8, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    series: [
      {
        ...barSeriesStyle(color),
        name: type.value === 'Expense' ? '支出金额' : '收入金额',
        data: values,
        // 横向条形的圆角在右端
        itemStyle: { color, borderRadius: [0, 4, 4, 0] },
      },
    ],
  }
})

const subtitle = computed(() => {
  if (rows.value.length === 0) return '无'
  const total = rows.value.reduce((sum, item) => sum + item.totalAmount, 0)
  const scope = type.value === 'Expense' ? '支出' : '收入'
  return `${scope}共 ${rows.value.length} 个一级分类 · 合计 ${formatMoney(total)}`
})

const summary = computed(() => {
  const top = rows.value[rows.value.length - 1]
  if (!top) return ''
  return `${type.value === 'Expense' ? '最高支出' : '最高收入'}分类是“${top.name}”，金额 ${formatMoney(top.totalAmount)}。`
})
</script>

<template>
  <ChartCard
    title="钱主要花在哪里"
    :subtitle="subtitle"
    :summary="summary"
    :option="option"
    :empty="isEmpty"
    empty-text="无"
    empty-hint="当前区间该类型下没有分类数据。"
    show-log-toggle
    v-model:log-scale="logScale"
    height="clamp(16rem, 40vh, 26rem)"
  >
    <template #actions-extra>
      <el-radio-group v-model="type" size="small">
        <el-radio-button value="Expense">支出</el-radio-button>
        <el-radio-button value="Income">收入</el-radio-button>
      </el-radio-group>
    </template>
  </ChartCard>
</template>
