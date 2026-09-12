<script setup lang="ts">
/**
 * 数据检查。
 *
 * ⛔ 关键规则：该接口**发现问题时 HTTP 仍然是 200**，
 * 因此绝不能用响应状态码判断数据是否健康，必须读 `healthy`。
 *
 * `healthy` 只由 error 数量决定：存在 warning 但没有 error 时仍可能为 true。
 *
 * 定位是"诊断信息"，**不提供任何自动修复按钮** —— 手册明确建议不要把
 * 前端做成修复工具，避免在用户不知情时改动账本数据。
 */
import { computed, onMounted } from 'vue'

import DataState from '@/components/common/DataState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { useAnalyticsStore } from '@/stores/analytics'
import type { DataQualityCode, DataQualitySeverity } from '@/types/analytics'
import { formatDateDisplay } from '@/utils/date'

const analytics = useAnalyticsStore()

const data = computed(() => analytics.dataQuality)

/** 人类可读的问题说明与处置建议。 */
const CODE_INFO: Record<DataQualityCode, { label: string; hint: string }> = {
  INVALID_ID: { label: 'ID 不是正整数', hint: '记录主键异常，建议核对原始数据。' },
  DUPLICATE_ID: { label: '同表重复 ID', hint: '两条记录共用同一 ID，会导致引用错乱。' },
  INVALID_DATE: { label: '日期不是有效日历日期', hint: '例如 2026-02-30，需修正为真实日期。' },
  INVALID_AMOUNT: { label: '金额不是正数', hint: '金额必须为大于 0 的有限数。' },
  INVALID_TYPE: { label: '收支类型枚举无效', hint: '普通流水应为 Income / Expense。' },
  UNKNOWN_CATEGORY: { label: '分类组合不存在', hint: '该记录的（类型, 一级, 二级）不在分类字典中。' },
  UNKNOWN_TAG: { label: '标签不存在', hint: '记录引用了已被改名的标签，需重新指定。' },
  UNKNOWN_FLOW_TYPE: { label: '往来类型不存在', hint: '外部往来的类型不在往来类型字典中。' },
  UNKNOWN_RELATED_PARTY: { label: '往来方不存在', hint: '外部往来的往来方不在往来方字典中。' },
  DANGLING_RELATED_ID: { label: '关联记录不存在', hint: 'RelatedID 指向了不存在的记录，会影响未偿金额计算。' },
  COUNTER_BEHIND: { label: 'ID 计数器落后', hint: '计数器小于当前最大 ID，新增记录可能发生 ID 冲突。' },
}

function issueCode(code: DataQualityCode): { label: string; hint: string } {
  return CODE_INFO[code] ?? { label: code, hint: '' }
}

/** 按严重程度分组，error 在前。 */
const grouped = computed(() => {
  const issues = data.value?.issues ?? []
  return {
    error: issues.filter((item) => item.severity === 'error'),
    warning: issues.filter((item) => item.severity === 'warning'),
  }
})

const isEmpty = computed(() => (data.value?.issues.length ?? 0) === 0)

const healthy = computed(() => data.value?.healthy ?? null)

const bannerType = computed<'success' | 'error' | 'warning'>(() => {
  if (healthy.value === null) return 'warning'
  if (healthy.value) return 'success'
  return 'error'
})

/**
 * 横幅文案。
 * 注意区分"有 error（不健康）"与"只有 warning（healthy 仍为 true）"，
 * 后者不能报成"数据损坏"。
 */
const bannerTitle = computed(() => {
  if (healthy.value === null) return '尚未检查'
  if (healthy.value) {
    const warnings = data.value?.summary.warning ?? 0
    return warnings > 0 ? `数据可用，但有 ${warnings} 项提醒` : '数据健康'
  }
  return `发现 ${data.value?.summary.error ?? 0} 个错误`
})

function severityTag(type: DataQualitySeverity): 'danger' | 'warning' {
  return type === 'error' ? 'danger' : 'warning'
}

function severityLabel(type: DataQualitySeverity): string {
  return type === 'error' ? '会影响统计准确性' : '建议整理'
}

onMounted(() => {
  void analytics.loadDataQuality()
})
</script>

<template>
  <div class="quality">
    <PageHeader
      title="数据检查"
      description="检查日期、金额、字典引用与往来关联是否会影响统计结果；本页只诊断，不自动修改账本。"
    />
    <DataState
      :loading="analytics.dataQualityLoading && !data"
      :error="analytics.dataQualityLoading ? null : analytics.dataQualityError"
      :empty="false"
      :skeleton-rows="5"
      @retry="analytics.loadDataQuality()"
    >
      <template v-if="data">
        <!-- 状态横幅：以 healthy 为准，不是 HTTP 状态码 -->
        <el-alert
          v-if="!isEmpty"
          :type="bannerType"
          :closable="false"
          show-icon
          class="quality__banner"
          :title="bannerTitle"
        >
          <template #default>
            <p class="quality__banner-text">
              错误 {{ data.summary.error }} · 提醒 {{ data.summary.warning }} · 合计
              {{ data.summary.total }}
            </p>
            <p class="quality__banner-meta">
              检查时间 {{ formatDateDisplay(data.checkedAt.slice(0, 10)) }} ·
              统计结论以检查结果为准
            </p>
          </template>
        </el-alert>

        <p v-if="!data.healthy" class="quality__notice">
          数据存在问题，但本页只做诊断，不提供自动修复。请根据下表逐条核对原始数据。
        </p>

        <!-- 空状态也要实现 -->
        <section v-if="isEmpty" class="nb-card quality__ok">
          <p class="quality__ok-title">未发现影响统计的问题</p>
          <p class="quality__ok-meta">
            已检查字段类型、日期合法性、金额、字典引用与关联 ID ·
            {{ formatDateDisplay(data.checkedAt.slice(0, 10)) }}
          </p>
        </section>

        <template v-else>
          <section
            v-for="severity in (['error', 'warning'] as DataQualitySeverity[])"
            :key="severity"
            class="nb-card quality__group"
          >
            <header class="quality__group-head">
              <h3 class="quality__group-title">
                <el-tag :type="severityTag(severity)" size="small" effect="plain">
                  {{ severityLabel(severity) }}
                </el-tag>
                <span>{{ grouped[severity].length }} 项</span>
              </h3>
            </header>

            <el-empty
              v-if="grouped[severity].length === 0"
              :description="`没有${severityLabel(severity)}级问题`"
              :image-size="60"
            />

            <el-table v-else :data="grouped[severity]" size="small" stripe>
              <el-table-column label="问题" min-width="160">
                <template #default="{ row }">
                  <div class="quality__code">
                    <span class="quality__code-name">{{ issueCode(row.code).label }}</span>
                    <code class="quality__code-raw">{{ row.code }}</code>
                  </div>
                </template>
              </el-table-column>

              <el-table-column prop="table" label="数据表" width="140" />
              <el-table-column label="位置" width="110">
                <template #default="{ row }">
                  <span class="tabular">
                    {{ row.id !== null ? `ID ${row.id}` : `#${row.index}` }}
                  </span>
                </template>
              </el-table-column>

              <el-table-column label="说明" min-width="220">
                <template #default="{ row }">
                  <p class="quality__message">{{ row.message }}</p>
                  <p v-if="issueCode(row.code).hint" class="quality__hint">
                    {{ issueCode(row.code).hint }}
                  </p>
                </template>
              </el-table-column>
            </el-table>
          </section>
        </template>
      </template>
    </DataState>
  </div>
</template>

<style scoped>
.quality {
  display: flex;
  flex-direction: column;
  gap: clamp(0.75rem, 2vw, 1rem);
}

.quality__banner-text {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
}

.quality__banner-meta {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  opacity: 0.85;
}

.quality__banner-meta code,
.quality__code-raw {
  font-family: var(--font-mono);
  font-size: 0.6875rem;
}

.quality__notice {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
}

.quality__ok {
  padding: 1.25rem 1.375rem;
}

.quality__ok-title {
  margin: 0 0 0.25rem;
  font-weight: 600;
  color: var(--nb-income);
}

.quality__ok-meta {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
}

.quality__group {
  padding: 1rem 1.125rem;
}

.quality__group-head {
  margin-bottom: 0.75rem;
}

.quality__group-title {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
}

.quality__code {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.quality__code-name {
  font-weight: 500;
}

.quality__code-raw {
  color: var(--nb-text-subtle);
}

.quality__message {
  margin: 0;
}

.quality__hint {
  margin: 0.125rem 0 0;
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}
</style>
