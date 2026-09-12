<script setup lang="ts">
/**
 * 现金余额趋势。
 *
 * 实测该系列有 63 个点、跨度 2021-08 至今、余额区间 12 917 ~ 335 926，
 * 因此必须提供 dataZoom 限制显示窗口，并提供对数轴看清小额阶段。
 *
 * 对数轴不能表示 0 与负数：这里在进入坐标系**之前**把不可表示的点
 * 置为 null 断开，而不是钳到一个伪造的极小值（那会篡改数据）。
 */
import { computed } from 'vue'

import ChartCard from '../ChartCard.vue'
import { categoryAxis, lineSeriesStyle, readChartTokens, valueAxis } from '../theme'
import type { EChartsOption } from '../echarts'
import { useLogScale, useZoomPreset } from '@/composables/useChartPreferences'
import type { CashBalancePoint } from '@/types/analytics'
import {
  NO_DATA_TEXT,
  createTooltipFormatter,
  hasRenderableValues,
  toLogSafeData,
} from '@/utils/chart'
import { formatMoney } from '@/utils/format'

const props = defineProps<{ points: CashBalancePoint[] }>()

const tokens = readChartTokens()
const { logScale } = useLogScale('cash-trend')
const { preset, startValueFor } = useZoomPreset()

const categories = computed(() => props.points.map((point) => point.date))

/** 当前是否真的有不可表示的点被丢弃，用于给出说明。 */
const omitInfo = computed(() => {
  if (!logScale.value) return { count: 0 }
  const { omittedIndexes } = toLogSafeData(props.points.map((point) => point.balance))
  return { count: omittedIndexes.length }
})

const option = computed<EChartsOption>(() => {
  const balances = props.points.map((point) => point.balance)
  // 线性模式保留原值（含 0 与负数），对数模式才做降级
  const values = logScale.value ? toLogSafeData(balances).data : balances

  return {
    tooltip: {
      trigger: 'axis',
      // 统一兜底：无数据项显示"无"，绝不出现 NaN/undefined。
      // 不再传 valueLabel —— 系列名已经说明了这是什么，重复会变成"现金余额：余额 ¥…"。
      formatter: createTooltipFormatter(formatMoney),
    },
    xAxis: categoryAxis(tokens, categories.value, true),
    yAxis: valueAxis(tokens, {
      log: logScale.value,
      name: logScale.value ? '余额（对数）' : '余额',
      hasRenderableData: hasRenderableValues(balances),
    }),
    series: [
      {
        ...lineSeriesStyle(tokens, 'palette', props.points.length),
        name: '现金余额',
        data: values,
        areaStyle: { opacity: 0.08, color: tokens.palette[0] },
      },
    ],
  }
})

const subtitle = computed(() => {
  const base = `共 ${props.points.length} 个数据点`
  if (omitInfo.value.count > 0) {
    return `${base} · 对数轴下有 ${omitInfo.value.count} 个非正数值不可表示，已断开显示`
  }
  return logScale.value ? `${base} · 对数坐标轴` : `${base} · 可拖动下方滑块查看区间`
})

const isEmpty = computed(() => props.points.length === 0)

const summary = computed(() => {
  if (props.points.length === 0) return ''
  const highest = props.points.reduce((best, point) => (point.balance > best.balance ? point : best))
  const latest = props.points[props.points.length - 1]
  return latest
    ? `期末为 ${formatMoney(latest.balance)}；区间最高为 ${formatMoney(highest.balance)}（${highest.date}）。`
    : ''
})
</script>

<template>
  <ChartCard
    title="现金余额如何变化"
    :subtitle="subtitle"
    :summary="summary"
    :option="option"
    :empty="isEmpty"
    :empty-text="NO_DATA_TEXT"
    empty-hint="当前区间没有现金流水。"
    show-log-toggle
    v-model:log-scale="logScale"
    show-zoom
    v-model:zoom-preset="preset"
    with-zoom
    :zoom-start-value="startValueFor(categories)"
    height="clamp(18rem, 36vh, 26rem)"
  />
</template>
