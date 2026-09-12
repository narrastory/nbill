<script setup lang="ts">
/**
 * 标签涉及金额：每个标签的金额，按一级分类堆叠。
 *
 * ⚠️ `totalAmount` 是**涉及金额**，不是净额、也不是纯支出。
 * 后端把带有该标签的普通收入与普通支出的**正金额相加**（`AppliesTo = Both`
 * 的标签尤其如此），而 `byCategory[]` 没有 `type` 字段，前端无法可靠拆分
 * 收支。所以这里既不能标注成"净赚/净花"，也不能按分类名去猜收支类型 ——
 * 只能在标题与副标题里如实写明口径。
 *
 * 堆叠条里的每一段是**分类**，属于身份语义，因此使用分类调色板，
 * 按固定顺序取色、不循环。
 *
 * 分类数超过调色板槽位时归入"其它"：生成新色相会破坏可辨识度。
 */
import { computed } from 'vue'

import ChartCard from '../ChartCard.vue'
import { barSeriesStyle, categoryAxis, readChartTokens, valueAxis } from '../theme'
import type { EChartsOption } from '../echarts'
import type { TagAnalysisItem } from '@/types/analytics'
import { createTooltipFormatter } from '@/utils/chart'
import { formatMoney } from '@/utils/format'

const props = defineProps<{ items: TagAnalysisItem[] }>()

const tokens = readChartTokens()

const categories = computed(() => props.items.map((item) => item.tag))
const isEmpty = computed(() => props.items.length === 0)

/** 调色板槽位上限；超出部分归入"其它"，绝不生成新色相。 */
const MAX_SLOTS = 10

/** 汇总所有出现过的分类，按总额降序，取前 N 个作为固定系列。 */
const topCategories = computed(() => {
  const totals = new Map<string, number>()
  for (const item of props.items) {
    for (const entry of item.byCategory) {
      totals.set(entry.category, (totals.get(entry.category) ?? 0) + entry.totalAmount)
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SLOTS - 1)
    .map(([name]) => name)
})

const hasOther = computed(() => {
  const all = new Set<string>()
  for (const item of props.items) {
    for (const entry of item.byCategory) all.add(entry.category)
  }
  return all.size > topCategories.value.length
})

interface SeriesSlot {
  name: string
  color: string
  data: number[]
}

/** 固定顺序取色：同一分类在所有标签下颜色一致，切换筛选不会重新着色。 */
const series = computed<SeriesSlot[]>(() => {
  const result: SeriesSlot[] = topCategories.value.map((name, index) => ({
    name,
    color: tokens.palette[index % tokens.palette.length],
    data: props.items.map((item) => {
      const entry = item.byCategory.find((c) => c.category === name)
      return entry ? entry.totalAmount : 0
    }),
  }))

  if (hasOther.value) {
    const kept = new Set(topCategories.value)
    result.push({
      name: '其它',
      color: tokens.textSubtle,
      data: props.items.map((item) =>
        item.byCategory
          .filter((c) => !kept.has(c.category))
          .reduce((sum, c) => sum + c.totalAmount, 0),
      ),
    })
  }

  return result
})

const option = computed<EChartsOption>(() => ({
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow' },
    // 前缀写明口径，避免读成"这个标签净花了多少"
    formatter: createTooltipFormatter(formatMoney, { valueLabel: '涉及金额' }),
  },
  xAxis: {
    ...categoryAxis(tokens, categories.value),
    axisLabel: { color: tokens.textMuted, fontSize: 11, rotate: 20, hideOverlap: true },
  },
  yAxis: valueAxis(tokens, { name: '涉及金额' }),
  series: series.value.map((slot) => ({
    ...barSeriesStyle(slot.color, true),
    name: slot.name,
    data: slot.data,
    // 堆叠段之间留出 2px 表面间隙，相邻色块不会糊在一起
    itemStyle: { color: slot.color, borderColor: tokens.surface, borderWidth: 2 },
  })),
}))

const subtitle = computed(() =>
  props.items.length === 0
    ? '无'
    : `${props.items.length} 个标签 · 收入与支出金额合计，非净额 · 按一级分类堆叠${hasOther.value ? ' · 较小分类已归入「其它」' : ''}`,
)
</script>

<template>
  <ChartCard
    title="不同标签涉及了多少金额"
    :subtitle="subtitle"
    :option="option"
    :empty="isEmpty"
    empty-text="无"
    empty-hint="当前区间没有带标签的记录。"
    height="clamp(16rem, 32vh, 22rem)"
  />
</template>
