<script setup lang="ts">
/**
 * 频次 × 平均金额散点。
 *
 * 散点的两个维度单位不同（笔数 vs 金额），这是散点图的固有形态，
 * **不是双轴图** —— 双轴指的是同一根轴方向上有两套刻度，这里没有。
 *
 * 需要回答的问题是"高频小额"还是"低频大额"，两项都是长尾，
 * 因此对数模式下 x、y 同时取对数（log-log 散点）。
 *
 * 点的面积编码总金额，所以图例/说明里要讲清楚，不能让读者猜。
 */
import { computed } from 'vue'

import ChartCard from '../ChartCard.vue'
import { readChartTokens, valueAxis } from '../theme'
import type { EChartsOption } from '../echarts'
import { useLogScale } from '@/composables/useChartPreferences'
import type { FrequencyAmountItem } from '@/types/analytics'
import { escapeHtml, hasRenderableValues, toLogSafeData } from '@/utils/chart'
import { formatCount, formatMoney } from '@/utils/format'

const props = defineProps<{ items: FrequencyAmountItem[] }>()

const tokens = readChartTokens()
const { logScale } = useLogScale('frequency-amount')

const EMPTY = '无'

/**
 * tooltip 里要同时展示多项，因此自己组装，但仍保证空值兜底。
 * 分类名来自用户录入的数据，拼进 HTML 前必须转义。
 *
 * ⚠️ **必须显示收支类型**。每个点的身份是「一级分类 + 二级分类 + 收支类型」，
 * 同一个二级分类会以两个不同的点出现（实测：「红包礼金」同时存在于
 * 「其它收入 / Income」和「人情社交 / Expense」）。只显示分类名会被误读成
 * 重复数据，而颜色虽然区分了收支，但不能指望读者去猜颜色含义。
 */
function formatter(params: unknown): string {
  const list = Array.isArray(params) ? params : [params]
  const first = list[0] as { data?: { raw?: FrequencyAmountItem } } | undefined
  const raw = first?.data?.raw
  if (!raw) return EMPTY

  const rows = [
    escapeHtml(`${raw.category} / ${raw.subcategory}`),
    `类型：${raw.type === 'Income' ? '收入' : '支出'}`,
    `笔数：${formatCount(raw.frequency)}`,
    `平均金额：${formatMoney(raw.avgAmount)}`,
    `总金额：${formatMoney(raw.totalAmount)}`,
  ]
  return rows.join('<br/>')
}

const option = computed<EChartsOption>(() => {
  const frequencies = props.items.map((item) => item.frequency)
  const averages = props.items.map((item) => item.avgAmount)

  const xLog = logScale.value
  const yLog = logScale.value

  // 面积按总金额归一化到 8~40px，避免极大值把图撑满
  const maxTotal = Math.max(0, ...props.items.map((item) => item.totalAmount))

  const data = props.items.map((item, index) => {
    const fx = xLog ? toLogSafeData([frequencies[index]]).data[0] : item.frequency
    const fy = yLog ? toLogSafeData([averages[index]]).data[0] : item.avgAmount
    const ratio = maxTotal > 0 ? item.totalAmount / maxTotal : 0
    return {
      value: [fx, fy],
      raw: item,
      symbolSize: 8 + Math.sqrt(ratio) * 32,
      itemStyle: {
        color: item.type === 'Expense' ? tokens.expense : tokens.income,
        // 重叠点用表面色描边，避免糊成一团
        borderColor: tokens.surface,
        borderWidth: 2,
        opacity: 0.85,
      },
    }
  })

  return {
    tooltip: { trigger: 'item', formatter },
    xAxis: {
      ...valueAxis(tokens, {
        log: xLog,
        name: xLog ? '笔数（对数）' : '笔数',
        hasRenderableData: hasRenderableValues(frequencies),
      }),
      // 散点的 x 不是类目轴，去掉分隔线更清爽
      splitLine: { show: true, lineStyle: { color: tokens.border, type: 'dashed' } },
    },
    yAxis: valueAxis(tokens, {
      log: yLog,
      name: yLog ? '平均金额（对数）' : '平均金额',
      hasRenderableData: hasRenderableValues(averages),
    }),
    series: [
      {
        type: 'scatter',
        name: '分类与收支类型',
        // 不做堆叠/连线，纯散点
        data,
        emphasis: { focus: 'self' },
      },
    ],
  }
})

const subtitle = computed(() => {
  if (props.items.length === 0) return EMPTY
  return `${props.items.length} 个分类与收支类型统计项 · 面积表示总金额 · 用于区分「高频小额」与「低频大额」`
})
</script>

<template>
  <ChartCard
    title="高频小额与低频大额"
    :subtitle="subtitle"
    :summary="subtitle"
    :option="option"
    :empty="false"
    :empty-text="EMPTY"
    show-log-toggle
    v-model:log-scale="logScale"
    height="clamp(16rem, 32vh, 22rem)"
  />
</template>
