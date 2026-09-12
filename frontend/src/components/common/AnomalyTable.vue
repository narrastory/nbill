<script setup lang="ts">
/**
 * 异常消费清单。
 *
 * 用表格而不是图表：这是一份**离散的问题清单**，读者要的是
 * "哪一类、哪个月、超了多少"，用图表反而需要悬停才能读到具体数值。
 *
 * 判定规则：某二级分类至少有 3 个月数据才参与；
 * 高于「均值 + 2 × 标准差」的月份被列为异常。
 */
import { computed } from 'vue'

import { useMediaQuery } from '@vueuse/core'

import type { AnomalyItem } from '@/types/analytics'
import { formatMoney, formatNullablePercent } from '@/utils/format'

const props = defineProps<{ items: AnomalyItem[] }>()

/** 窄屏隐藏"历史均值"与"阈值"，保留金额、分类与超出比例。 */
const isNarrow = useMediaQuery('(max-width: 639px)')

/** 按超出比例降序，最异常的排最前。 */
const rows = computed(() =>
  [...props.items].sort((a, b) => b.excessPercent - a.excessPercent),
)

const isEmpty = computed(() => rows.value.length === 0)
</script>

<template>
  <section class="nb-card anomaly">
    <header class="anomaly__head">
      <h3 class="anomaly__title">异常消费</h3>
      <p class="anomaly__subtitle">
        按二级分类与月份统计 · 该分类至少 3 个月数据才参与 · 高于「均值 + 2 × 标准差」视为异常
      </p>
    </header>

    <el-empty v-if="isEmpty" description="没有检测到异常月份" :image-size="70" />

    <el-table v-else :data="rows" stripe size="small" max-height="22rem">
      <el-table-column label="月份" width="100">
        <template #default="{ row }">
          <span class="tabular">{{ row.yearMonth }}</span>
        </template>
      </el-table-column>

      <el-table-column label="分类" min-width="130" show-overflow-tooltip>
        <template #default="{ row }">{{ row.subcategory }}</template>
      </el-table-column>

      <el-table-column label="当月金额" width="120" align="right">
        <template #default="{ row }">
          <span class="nb-amount--expense tabular">{{ formatMoney(row.amount) }}</span>
        </template>
      </el-table-column>

      <el-table-column v-if="!isNarrow" label="历史均值" width="110" align="right">
        <template #default="{ row }">
          <span class="tabular">{{ formatMoney(row.mean) }}</span>
        </template>
      </el-table-column>

      <el-table-column v-if="!isNarrow" label="阈值" width="110" align="right">
        <template #default="{ row }">
          <span class="tabular">{{ formatMoney(row.threshold) }}</span>
        </template>
      </el-table-column>

      <el-table-column label="超出" width="96" align="right">
        <template #default="{ row }">
          <!-- 后端保证 excessPercent 有值，但仍走 nullable 格式化兜底 -->
          <el-tag size="small" type="warning" effect="light">
            {{ formatNullablePercent(row.excessPercent, 0) }}
          </el-tag>
        </template>
      </el-table-column>
    </el-table>
  </section>
</template>

<style scoped>
.anomaly {
  padding: 1rem 1.125rem;
}

.anomaly__head {
  margin-bottom: 0.75rem;
}

.anomaly__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.anomaly__subtitle {
  margin: 0.125rem 0 0;
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}
</style>
