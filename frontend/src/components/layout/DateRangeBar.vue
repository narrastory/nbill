<script setup lang="ts">
/**
 * 分析类页面的日期区间选择。
 *
 * 与图表内的 dataZoom 是**两回事**：
 *  - 这里的区间决定请求参数 `dateFrom` / `dateTo`，会重新向后端取数；
 *  - dataZoom 只改变已有数据的显示窗口，不发请求。
 *
 * 后端规则：dateTo 省略时默认今天且不允许未来日期；dateFrom 省略表示
 * 从最早数据开始；dateFrom 晚于 dateTo 会返回 400，因此本地先校验。
 */
import { ref } from 'vue'

import { ElMessage } from 'element-plus'

import { daysAgo, isFutureDate, isValidDateString, localDateString } from '@/utils/date'

const props = withDefaults(
  defineProps<{
    dateFrom?: string
    dateTo?: string
    loading?: boolean
  }>(),
  { dateFrom: '', dateTo: '', loading: false },
)

const emit = defineEmits<{ change: [range: { dateFrom?: string; dateTo?: string }] }>()

/**
 * 快捷区间。
 *
 * 后端日期参数**首尾都包含**，所以「近 30 天」要用 `daysAgo(29)`：
 * 原先写 `daysAgo(30)` 会把区间撑成 31 个日历日。
 *
 * 标签也一并改成「天」，不再叫「近 1 月」—— 那样读起来像自然月，实际却按
 * 固定天数算，两种口径混在一起最容易误解。若将来确实要自然月口径，
 * 应改用日历月边界并改名为「近 1 个自然月」，而不是只改标签。
 */
const PRESETS = [
  { label: '近 30 天', span: 30 },
  { label: '近 90 天', span: 90 },
  { label: '近 365 天', span: 365 },
  { label: '全部', span: null },
] as const

const from = ref(props.dateFrom)
const to = ref(props.dateTo)

const activePreset = ref<string | null>(null)

function applyPreset(span: number | null): void {
  activePreset.value = span === null ? 'all' : String(span)
  if (span === null) {
    from.value = ''
    to.value = ''
  } else {
    // 闭区间：回推 span - 1 天，连今天正好 span 个日历日
    from.value = daysAgo(span - 1)
    to.value = localDateString()
  }
  search()
}

function search(): void {
  for (const [value, label] of [
    [from.value, '开始日期'],
    [to.value, '结束日期'],
  ] as const) {
    if (value === '') continue
    if (!isValidDateString(value)) {
      ElMessage.warning(`${label}格式不正确`)
      return
    }
    if (isFutureDate(value)) {
      ElMessage.warning(`${label}不能晚于今天`)
      return
    }
  }
  if (from.value && to.value && from.value > to.value) {
    ElMessage.warning('开始日期不能晚于结束日期')
    return
  }

  emit('change', {
    dateFrom: from.value || undefined,
    dateTo: to.value || undefined,
  })
}

function reset(): void {
  from.value = ''
  to.value = ''
  activePreset.value = null
  emit('change', {})
}
</script>

<template>
  <section class="nb-card date-range" aria-label="日期区间">
    <div class="date-range__presets">
      <button
        v-for="item in PRESETS"
        :key="item.label"
        type="button"
        class="date-range__preset"
        :class="{ 'is-active': activePreset === (item.span === null ? 'all' : String(item.span)) }"
        @click="applyPreset(item.span)"
      >
        {{ item.label }}
      </button>
    </div>

    <div class="date-range__inputs">
      <el-date-picker
        v-model="from"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="最早"
        class="date-range__picker"
      />
      <span class="date-range__sep">至</span>
      <el-date-picker
        v-model="to"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="今天"
        class="date-range__picker"
      />
      <el-button type="primary" :loading="props.loading" @click="search">应用</el-button>
      <el-button :disabled="props.loading" @click="reset">重置</el-button>
    </div>
  </section>
</template>

<style scoped>
.date-range {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
}

.date-range__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.date-range__preset {
  padding: 0.3125rem 0.6875rem;
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
  cursor: pointer;
  background-color: var(--color-ink-100);
  border: 0;
  border-radius: 999px;
  transition:
    background-color var(--duration-fast) var(--ease-out-soft),
    color var(--duration-fast) var(--ease-out-soft);
}

.date-range__preset:hover {
  color: var(--nb-text);
  background-color: var(--color-ink-200);
}

.date-range__preset.is-active {
  font-weight: 600;
  color: #ffffff;
  background-color: var(--nb-primary);
}

.date-range__inputs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.date-range__picker {
  width: 9.5rem;
}

.date-range__sep {
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
}

@media (max-width: 639px) {
  .date-range {
    flex-direction: column;
    align-items: stretch;
  }

  .date-range__picker {
    width: 100%;
  }

  .date-range__inputs {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
