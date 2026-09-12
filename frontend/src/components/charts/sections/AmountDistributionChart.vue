<script setup lang="ts">
/**
 * 金额分布直方图。
 *
 * ⚠️ 区间规则是 `(min, max]`（左开右闭），且 `max: null` 表示无穷大。
 * 因此轴标签必须用自己的 formatAmountBucket 生成，
 * 不能直接用 `min`（那会把"10~50"标成"10"，语义全错），
 * 也不能显示 `null`。
 *
 * 提供对数轴：小额区间（1~5 元）与大额区间（1000~5000 元）的笔数
 * 可能差一个数量级以上，线性轴会把长尾压平。
 */
import { computed } from 'vue'

import ChartCard from '../ChartCard.vue'
import { barSeriesStyle, categoryAxis, readChartTokens, valueAxis } from '../theme'
import type { EChartsOption } from '../echarts'
import { useLogScale } from '@/composables/useChartPreferences'
import type { AmountBucket } from '@/types/analytics'
import { createTooltipFormatter, hasRenderableValues, toLogSafeData } from '@/utils/chart'
import { formatAmountBucket, formatCount } from '@/utils/format'

const props = defineProps<{
  income: AmountBucket[]
  expense: AmountBucket[]
}>()

const tokens = readChartTokens()
const { logScale } = useLogScale('amount-distribution')

type Kind = 'expense' | 'income'
const kind = defineModel<Kind>('kind', { default: 'expense' })

const buckets = computed(() => (kind.value === 'expense' ? props.expense : props.income))

/** 轴标签：`(min, max]`，max 为 null 时显示"高于 X"。 */
const labels = computed(() => buckets.value.map((b) => formatAmountBucket(b.min, b.max)))

const isEmpty = computed(() => buckets.value.length === 0)

const option = computed<EChartsOption>(() => {
  const counts = buckets.value.map((b) => b.count)
  const values = logScale.value ? toLogSafeData(counts).data : counts

  const color = kind.value === 'expense' ? tokens.expense : tokens.income

  return {
    tooltip: {
      trigger: 'axis',
      // count 一定存在，不会出现 NaN；金额区间文案自带兜底
      formatter: createTooltipFormatter(formatCount),
    },
    xAxis: {
      ...categoryAxis(tokens, labels.value),
      // 区间标签较长，旋转 30° 比隐藏更易读
      axisLabel: { color: tokens.textMuted, fontSize: 11, rotate: 30, hideOverlap: true },
    },
    yAxis: valueAxis(tokens, {
      log: logScale.value,
      name: logScale.value ? '笔数（对数）' : '笔数',
      hasRenderableData: hasRenderableValues(counts),
    }),
    series: [
      {
        ...barSeriesStyle(color),
        name: kind.value === 'expense' ? '支出笔数' : '收入笔数',
        data: values,
      },
    ],
  }
})
</script>

<template>
  <ChartCard
    title="每笔金额通常有多大"
    :subtitle="`区间为左开右闭 (min, max]，「max 为空」表示高于该下限 · ${
      logScale ? '对数坐标轴' : '线性坐标轴'
    }`"
    :option="option"
    :empty="isEmpty"
    empty-text="无"
    empty-hint="当前区间没有可分布的记录。"
    show-log-toggle
    v-model:log-scale="logScale"
    height="clamp(15rem, 30vh, 21rem)"
  >
    <template #actions-extra>
      <el-radio-group v-model="kind" size="small">
        <el-radio-button value="expense">支出</el-radio-button>
        <el-radio-button value="income">收入</el-radio-button>
      </el-radio-group>
    </template>
  </ChartCard>
</template>
