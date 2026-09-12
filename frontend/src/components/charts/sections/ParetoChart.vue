<script setup lang="ts">
/**
 * 帕累托图（支出二级分类）。
 *
 * ⚠️ 刻意**不用双轴**。
 * 经典帕累托是"金额柱 + 累计百分比线"两根轴，但双轴图的两个刻度
 * 会各自缩放，视觉上的交叉点毫无意义，是最常见的图表误导。
 *
 * 这里的做法：后端已经同时给了 `percent`（占总额比例）与
 * `cumulativePercent`（累计比例），两者都是 0~100 的百分比，
 * 因此可以画在**同一根 0~100% 轴**上 —— 既保留帕累托的信息，
 * 又不引入第二根轴。
 *
 * `isCore` 标记了使累计比例首次跨过 80% 的那一项，是关注重点。
 *
 * ⚠️ 统计身份是「一级分类 + 二级分类」，不是二级分类。两个一级分类下可能
 * 存在同名二级分类，只显示二级分类会出现无法区分的重复标签。
 * 但横轴上放不下「一级 / 二级」：项数可达 64，即使旋转 30° 也会互相压住。
 * 因此取折中 —— **轴上只写二级分类，tooltip 里给完整身份**。
 * 也**不要**在前端按 subcategory 合并后端返回的项。
 */
import { computed } from 'vue'

import ChartCard from '../ChartCard.vue'
import { barSeriesStyle, categoryAxis, lineSeriesStyle, readChartTokens, valueAxis } from '../theme'
import type { EChartsOption } from '../echarts'
import type { ParetoItem } from '@/types/analytics'
import { NO_DATA_TEXT, escapeHtml } from '@/utils/chart'
import { formatMoney, formatNullablePercent } from '@/utils/format'

const props = defineProps<{ items: ParetoItem[] }>()

const tokens = readChartTokens()

const categories = computed(() => props.items.map((item) => item.subcategory))
const isEmpty = computed(() => props.items.length === 0)

const coreCount = computed(() => props.items.filter((item) => item.isCore).length)

/** tooltip 用完整身份（一级 / 二级），分类名来自用户录入，必须转义。 */
function formatter(params: unknown): string {
  const list = Array.isArray(params) ? params : [params]
  const first = list[0] as { dataIndex?: number } | undefined
  const item = first?.dataIndex !== undefined ? props.items[first.dataIndex] : undefined
  if (!item) return NO_DATA_TEXT

  return [
    escapeHtml(`${item.category} / ${item.subcategory}`),
    `单项占比：${formatNullablePercent(item.percent)}`,
    `累计占比：${formatNullablePercent(item.cumulativePercent)}`,
    `金额：${formatMoney(item.amount)}`,
  ].join('<br/>')
}

const option = computed<EChartsOption>(() => ({
  tooltip: {
    trigger: 'axis',
    formatter,
  },
  xAxis: {
    ...categoryAxis(tokens, categories.value),
    axisLabel: { color: tokens.textMuted, fontSize: 11, rotate: 30, hideOverlap: true },
  },
  yAxis: {
    ...valueAxis(tokens, { name: '百分比' }),
    max: 100,
    axisLabel: {
      color: tokens.textMuted,
      fontSize: 11,
      formatter: (value: number) => (Number.isFinite(value) ? `${value}%` : ''),
    },
  },
  series: [
    {
      ...barSeriesStyle(tokens.palette[0]),
      name: '单项占比',
      // 核心项（累计首破 80%）用更深的色阶强调
      data: props.items.map((item) => ({
        value: item.percent,
        itemStyle: { color: item.isCore ? tokens.palette[0] : tokens.palette[8] },
      })),
    },
    {
      ...lineSeriesStyle(tokens, tokens.warning, props.items.length),
      name: '累计占比',
      data: props.items.map((item) => item.cumulativePercent),
      itemStyle: { color: tokens.warning },
      lineStyle: { width: 2, color: tokens.warning },
      // 80% 参考线：帕累托的分界
      markLine: {
        silent: true,
        symbol: 'none',
        lineStyle: { color: tokens.textSubtle, type: 'dashed' },
        label: { formatter: '80%', color: tokens.textSubtle, fontSize: 10 },
        data: [{ yAxis: 80 }],
      },
    },
  ],
}))

const subtitle = computed(
  () =>
    `单项占比与累计占比同为百分比，共用一根 0~100% 轴（不使用双轴）· 前 ${coreCount.value} 项构成核心支出 · 轴上为二级分类，悬停可见「一级 / 二级」完整分类`,
)
</script>

<template>
  <ChartCard
    title="哪些支出构成主要部分"
    :subtitle="subtitle"
    :summary="`前 ${coreCount} 项共同构成核心支出范围（累计约 80%）。`"
    :option="option"
    :empty="isEmpty"
    empty-text="无"
    empty-hint="当前区间没有支出二级分类数据。"
    height="clamp(16rem, 32vh, 22rem)"
  />
</template>
