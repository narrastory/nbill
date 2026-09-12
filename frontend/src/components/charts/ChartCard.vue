<script setup lang="ts">
/**
 * 图表卡片外壳。
 *
 * 统一承担：
 *  - 标题 / 副标题 / 右上角操作区（对数轴切换、时间范围快捷键）
 *  - 加载中 / 错误 / 空 三种状态（复用 DataState）
 *  - 注入主题、网格、图例、tooltip 样式、dataZoom、动画偏好
 *
 * 图表自身的 option 由调用方传入；对数轴与时间范围**由调用方持有状态**
 * 并 v-model 绑定，因为轴类型会改变 option 的构造方式。
 *
 * 空数据时不渲染空坐标系，直接显示空状态 —— 空坐标系看起来像加载失败。
 */
import { computed } from 'vue'

import VChart from 'vue-echarts'

import './echarts'
import {
  baseGrid,
  dataZoomConfig,
  emptyOption,
  legendStyle,
  readChartTokens,
  tooltipStyle,
} from './theme'
import type { EChartsOption } from './echarts'
import DataState from '@/components/common/DataState.vue'
import { ZOOM_PRESETS, type ZoomPreset } from '@/composables/useChartPreferences'
import { chartAnimation } from '@/utils/chart'

const props = withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    /** 图表外可直接读取的结论；不能把关键信息只留在 hover tooltip。 */
    summary?: string
    /** 图表特有配置：series、xAxis/yAxis 的 data、以及需要覆盖的默认项。 */
    option: EChartsOption
    loading?: boolean
    error?: string | null
    empty?: boolean
    emptyText?: string
    emptyHint?: string
    /** 显示"线性 / 对数"切换。 */
    showLogToggle?: boolean
    logScale?: boolean
    /** 显示时间范围快捷区间。 */
    showZoom?: boolean
    zoomPreset?: ZoomPreset
    /**
     * 是否使用 dataZoom（同时决定底部留白）。
     * dataZoom 由本组件统一构造，调用方不要自己往 option 里塞，
     * 否则会出现两组同类型组件互相覆盖。
     */
    withZoom?: boolean
    /** dataZoom 的起始类目，来自 useZoomPreset 的 zoomStartValue()。 */
    zoomStartValue?: string
    height?: string
  }>(),
  {
    subtitle: '',
    summary: '',
    loading: false,
    error: null,
    empty: false,
    emptyText: '暂无数据',
    emptyHint: '',
    showLogToggle: false,
    logScale: false,
    showZoom: false,
    zoomPreset: '1y',
    withZoom: false,
    zoomStartValue: undefined,
    height: 'clamp(16rem, 32vh, 24rem)',
  },
)

const emit = defineEmits<{
  'update:logScale': [value: boolean]
  'update:zoomPreset': [value: ZoomPreset]
}>()

const tokens = readChartTokens()

function handleScaleCommand(command: string | number | object): void {
  emit('update:logScale', command === 'log')
}

/** 图例只在 ≥2 个系列时出现；单系列由标题指明身份，不需要图例框。 */
const seriesCount = computed(() => {
  const series = props.option.series
  if (Array.isArray(series)) return series.length
  return series ? 1 : 0
})

/**
 * 合并成最终 option。
 * 顺序很关键：调用方传入的配置优先，外壳只补默认值。
 */
const mergedOption = computed<EChartsOption>(() => {
  if (props.empty) return emptyOption(tokens)

  const input = props.option
  const seriesArray = Array.isArray(input.series) ? input.series : input.series ? [input.series] : []
  const needsLegend = seriesCount.value >= 2 && seriesArray.some((s) => s && (s as { name?: string }).name)

  // 先展开调用方的配置，再逐项覆盖需要统一的部分。
  // tooltip 只合并样式，调用方传入的内容 formatter 必须保留。
  return {
    ...chartAnimation(),
    ...input,
    grid: {
      ...baseGrid({ withZoom: props.withZoom }),
      ...(input.grid as object),
    },
    tooltip: {
      ...tooltipStyle(tokens),
      ...(input.tooltip as object),
    },
    legend: {
      ...legendStyle(tokens, needsLegend),
      ...(input.legend as object),
    },
    // 统一在这里构造，调用方传入的 dataZoom 一律忽略，避免同类型组件重复。
    dataZoom: dataZoomConfig(props.withZoom, props.zoomStartValue, tokens),
  } as EChartsOption
})
</script>

<template>
  <section class="nb-card chart-card">
    <header class="chart-card__head">
      <div class="chart-card__titles">
        <h3 class="chart-card__title">{{ title }}</h3>
        <p v-if="subtitle" class="chart-card__subtitle">{{ subtitle }}</p>
        <span v-if="showLogToggle && logScale" class="chart-card__scale-badge">对数刻度</span>
      </div>

      <div class="chart-card__actions">
        <!-- 图表自己的控件（例如支出/收入切换） -->
        <slot name="actions-extra" />

        <!-- 时间范围：纯前端窗口，不触发请求 -->
        <el-radio-group
          v-if="showZoom"
          :model-value="zoomPreset"
          size="small"
          @update:model-value="(v: string | number | boolean | undefined) => emit('update:zoomPreset', v as ZoomPreset)"
        >
          <el-radio-button
            v-for="item in ZOOM_PRESETS"
            :key="item.value"
            :value="item.value"
          >
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>

        <!-- 对数轴属于高级阅读方式，收进低权重菜单；启用后标题旁持续标识。 -->
        <el-dropdown v-if="showLogToggle" trigger="click" @command="handleScaleCommand">
          <el-button size="small" plain>刻度：{{ logScale ? '对数' : '线性' }}</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="linear" :disabled="!logScale">线性刻度</el-dropdown-item>
              <el-dropdown-item command="log" :disabled="logScale">对数刻度</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>

    <p v-if="summary" class="chart-card__summary">{{ summary }}</p>

    <DataState
      :loading="loading"
      :error="error"
      :empty="empty"
      :empty-text="emptyText"
      :empty-hint="emptyHint"
      :skeleton-rows="4"
    >
      <div class="chart-card__plot" :style="{ height }">
        <VChart :option="mergedOption" autoresize class="chart-card__canvas" />
      </div>
    </DataState>
  </section>
</template>

<style scoped>
.chart-card {
  padding: 1rem 1.125rem;
}

.chart-card__head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.chart-card__titles {
  min-width: 0;
}

.chart-card__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.chart-card__subtitle {
  margin: 0.125rem 0 0;
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.chart-card__scale-badge {
  display: inline-flex;
  padding: 0.125rem 0.375rem;
  margin-top: 0.375rem;
  font-size: 0.6875rem;
  color: var(--nb-primary);
  background: var(--nb-primary-soft);
  border-radius: 0.25rem;
}

.chart-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.chart-card__plot {
  width: 100%;
}

.chart-card__summary {
  padding: 0.5rem 0.625rem;
  margin: 0.25rem 0 0.5rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--nb-text-muted);
  background: var(--nb-surface-muted);
  border-left: 2px solid var(--nb-primary);
}

.chart-card__canvas {
  width: 100%;
  height: 100%;
}
</style>
