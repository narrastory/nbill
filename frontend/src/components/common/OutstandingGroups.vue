<script setup lang="ts">
/**
 * 未结清往来业务组。
 *
 * `RelatedID` 不是父子关系，而是无向连通分量：一笔借出加上若干笔归还
 * 共同构成一个"组"，未偿金额必须按整组计算，单看一条 OUT 会高估欠款。
 *
 * 四种状态（手册 BUSINESS_RULES §5）：
 *  open          尚有未偿
 *  settled       已结清
 *  overpaid      流入超过流出
 *  unmatched-in  只有流入、没有关联的流出
 *
 * 关于 unmatched-in：它**不等于数据损坏**。可能是尚未建立关联，也可能是
 * 独立的报销到账、押金退回等真实业务，后端已明确不把它计入 totalOverpaid。
 * 因此这里只做中性提示，不断言金额错误；真正的数据异常以
 * `danglingRelatedIds` 和 /analytics/data-quality 为准。
 *
 * `ageDays` 只对 open 组有意义，且后端对非 open 组返回的是 `0` 而不是 null，
 * 所以判断条件是 `status === 'open'`，不能写成 `ageDays !== null`。
 */
import { computed } from 'vue'

import type { OutstandingGroup, OutstandingResponse, OutstandingStatus } from '@/types/analytics'
import { formatDateDisplay } from '@/utils/date'
import { formatMoney } from '@/utils/format'

const props = defineProps<{ response: OutstandingResponse }>()

interface StatusMeta {
  label: string
  type: 'success' | 'warning' | 'info' | 'danger'
  description: string
}

const STATUS_META: Record<OutstandingStatus, StatusMeta> = {
  open: { label: '未结清', type: 'warning', description: '流出大于流入，仍有未偿金额' },
  settled: { label: '已结清', type: 'success', description: '流入与流出相等' },
  overpaid: { label: '流入超额', type: 'info', description: '流入大于流出' },
  'unmatched-in': {
    label: '无匹配流入',
    type: 'danger',
    description: '只有流入，未关联对应流出；请按业务确认是否需要补充关联',
  },
}

function meta(status: OutstandingStatus): StatusMeta {
  return STATUS_META[status] ?? { label: status, type: 'info', description: '' }
}

/**
 * 第三列的标题与取值必须按状态区分。
 *
 * 不能简单地写成「overpaidAmount > 0 ? 流入超额 : 未偿」：
 * unmatched-in 组的 overpaidAmount 恰好等于 totalIn（因为 totalOut 为 0），
 * 于是会被误标成"流入超额"——但那一列要表达的是"这组只有流入、没有关联的
 * 流出"，与多收了钱是两回事。
 */
function balanceLabel(group: OutstandingGroup): string {
  switch (group.status) {
    case 'overpaid':
      return '流入超额'
    case 'unmatched-in':
      return '无匹配流入'
    default:
      return '未偿'
  }
}

function balanceValue(group: OutstandingGroup): number {
  switch (group.status) {
    case 'overpaid':
      return group.overpaidAmount
    case 'unmatched-in':
      return group.totalIn
    default:
      return group.outstandingAmount
  }
}

const summary = computed(() => props.response.summary)
const groups = computed(() => props.response.groups)

/** 汇总条：各状态组数与合计金额。 */
const summaryItems = computed(() => [
  { label: '全部业务组', value: String(summary.value.totalGroups) },
  { label: '已结清', value: String(summary.value.settledGroups) },
  { label: '流入超额', value: String(summary.value.overpaidGroups) },
  { label: '无匹配流入', value: String(summary.value.unmatchedInGroups) },
])
</script>

<template>
  <div class="outstanding">
    <!-- 汇总 -->
    <section class="nb-card outstanding__summary" aria-label="往来组汇总">
      <div class="outstanding__primary">
        <span>未结清</span>
        <strong class="tabular">{{ formatMoney(summary.totalOutstanding) }}</strong>
        <small>{{ summary.openGroups }} 个业务组仍待结算</small>
      </div>
      <dl class="outstanding__stats">
        <div v-for="item in summaryItems" :key="item.label" class="outstanding__stat">
          <dt>{{ item.label }}</dt>
          <dd class="tabular">{{ item.value }}</dd>
        </div>
      </dl>

      <div class="outstanding__totals">
        <p v-if="summary.totalOverpaid > 0" class="outstanding__total">
          <span class="outstanding__total-label">流入超额合计</span>
          <strong class="nb-amount--income tabular">
            {{ formatMoney(summary.totalOverpaid) }}
          </strong>
        </p>
        <p class="outstanding__asof">统计截止 {{ formatDateDisplay(response.asOf) }}</p>
      </div>
    </section>

    <!-- 分组卡片 -->
    <ul class="outstanding__list">
      <li
        v-for="group in groups"
        :key="group.groupId"
        class="nb-card outstanding__card"
        :class="`outstanding__card--${group.status}`"
      >
        <header class="outstanding__card-head">
          <span class="outstanding__group-id">组 #{{ group.groupId }}</span>
          <!-- description 之前从未被渲染，等于白写；挂到 title 上让它真的能被读到 -->
          <el-tag
            :type="meta(group.status).type"
            size="small"
            effect="light"
            :title="meta(group.status).description"
          >
            {{ meta(group.status).label }}
          </el-tag>
          <!--
            账龄只对 open 组显示。后端对非 open 组返回的是 0（不是 null），
            用 `ageDays !== null` 判断会让每个已结清/超额/无匹配组都显示
            "账龄 0 天"。也不能用 `ageDays > 0`：截止日与流出日相同时合法账龄就是 0。
            提示语用响应的 asOf 而不是"至今"——用户可能查的是历史截止日。
          -->
          <span
            v-if="group.status === 'open'"
            class="outstanding__age"
            :title="`从 ${formatDateDisplay(group.earliestOutDate)} 至 ${formatDateDisplay(response.asOf)}`"
          >
            账龄 {{ group.ageDays }} 天
          </span>
        </header>

        <p class="outstanding__parties">
          <template v-if="group.parties.length > 1">
            涉及 {{ group.parties.length }} 位往来方：{{ group.parties.join('、') }}
          </template>
          <template v-else>{{ group.parties[0] ?? '（未记录往来方）' }}</template>
        </p>

        <p class="outstanding__members">
          成员记录：
          <span class="tabular">{{ group.transactionIds.map((id) => `#${id}`).join('、') }}</span>
        </p>

        <dl class="outstanding__amounts">
          <div>
            <dt>流出</dt>
            <dd class="tabular">{{ formatMoney(group.totalOut) }}</dd>
          </div>
          <div>
            <dt>流入</dt>
            <dd class="tabular">{{ formatMoney(group.totalIn) }}</dd>
          </div>
          <div
            class="outstanding__amounts--emphasis"
            :class="`outstanding__amounts--${group.status}`"
          >
            <dt>{{ balanceLabel(group) }}</dt>
            <dd class="tabular">{{ formatMoney(balanceValue(group)) }}</dd>
          </div>
        </dl>

        <!-- 引用了不存在的记录：数据异常，必须显式提示 -->
        <el-alert
          v-if="group.danglingRelatedIds.length > 0"
          type="warning"
          :closable="false"
          show-icon
          class="outstanding__alert"
          :title="`引用了不存在的记录 ID：${group.danglingRelatedIds.join('、')}`"
          description="该组的未偿金额可能不准确，建议在数据检查页确认。"
        />
      </li>
    </ul>

    <!-- 按往来方汇总，只含未结清组 -->
    <section v-if="response.byParty.length > 0" class="nb-card outstanding__party">
      <h3 class="outstanding__party-title">按往来方汇总（仅未结清）</h3>
      <ul class="outstanding__party-list">
        <li v-for="item in response.byParty" :key="item.party" class="outstanding__party-row">
          <span class="outstanding__party-name">{{ item.party }}</span>
          <span class="outstanding__party-meta">{{ item.openGroups }} 组未结清</span>
          <span class="outstanding__party-meta">最久 {{ item.oldestAgeDays }} 天</span>
          <span class="outstanding__party-amount nb-amount--expense tabular">
            {{ formatMoney(item.outstandingAmount) }}
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.outstanding {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.outstanding__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.125rem;
}

.outstanding__primary {
  display: flex;
  flex-direction: column;
  min-width: 12rem;
  padding-right: 1.25rem;
  border-right: 2px solid var(--nb-expense);
}

.outstanding__primary span,
.outstanding__primary small {
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.outstanding__primary strong {
  margin-block: 0.25rem;
  font-size: 1.5rem;
  color: var(--nb-expense);
}

.outstanding__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  margin: 0;
}

.outstanding__stat dt {
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.outstanding__stat dd {
  margin: 0.125rem 0 0;
  font-size: 1.0625rem;
  font-weight: 600;
}

.outstanding__totals {
  text-align: right;
}

.outstanding__total {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  justify-content: flex-end;
  margin: 0 0 0.125rem;
}

.outstanding__total-label {
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.outstanding__asof {
  margin: 0.25rem 0 0;
  font-size: 0.6875rem;
  color: var(--nb-text-subtle);
}

.outstanding__list {
  display: grid;
  gap: 0.75rem;
  padding: 0;
  margin: 0;
  list-style: none;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
}

.outstanding__card {
  padding: 0.9375rem 1rem;
}

.outstanding__card--open {
  border-left: 3px solid var(--nb-expense);
}

.outstanding__card--settled {
  color: var(--nb-text-muted);
  background: color-mix(in srgb, var(--nb-surface) 72%, var(--nb-surface-muted));
}

.outstanding__card--overpaid {
  border-left: 3px solid var(--nb-info);
}

.outstanding__card--unmatched-in {
  border-left: 3px solid var(--nb-warning);
}

.outstanding__card-head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.5rem;
}

.outstanding__group-id {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.outstanding__age {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.outstanding__parties {
  margin: 0 0 0.25rem;
  font-weight: 500;
}

.outstanding__members {
  margin: 0 0 0.75rem;
  font-size: 0.75rem;
  color: var(--nb-text-subtle);
  overflow-wrap: anywhere;
}

.outstanding__amounts {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding-top: 0.625rem;
  margin: 0;
  border-top: 1px solid var(--nb-border);
}

.outstanding__amounts > div:not(:last-child)::after {
  content: '→';
  position: absolute;
  top: 50%;
  right: -0.375rem;
  color: var(--nb-text-subtle);
  transform: translateY(-50%);
}

.outstanding__amounts > div {
  position: relative;
}

.outstanding__amounts dt {
  font-size: 0.6875rem;
  color: var(--nb-text-muted);
}

.outstanding__amounts dd {
  margin: 0.125rem 0 0;
  font-size: 0.875rem;
  font-weight: 600;
}

/* 第三列按状态着色：未偿是欠款（支出色），流入超额是多收（收入色），
   无匹配流入需要用户留意（提醒色），已结清为中性。 */
.outstanding__amounts--emphasis dd {
  color: var(--nb-text);
}

.outstanding__amounts--open dd {
  color: var(--nb-expense);
}

.outstanding__amounts--overpaid dd {
  color: var(--nb-income);
}

.outstanding__amounts--unmatched-in dd {
  color: var(--nb-warning);
}

.outstanding__alert {
  margin-top: 0.75rem;
}

.outstanding__party {
  padding: 1rem 1.125rem;
}

.outstanding__party-title {
  margin: 0 0 0.625rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.outstanding__party-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.outstanding__party-row {
  display: grid;
  gap: 0.5rem;
  align-items: baseline;
  grid-template-columns: minmax(4rem, 1fr) auto auto auto;
  font-size: 0.8125rem;
}

.outstanding__party-name {
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outstanding__party-meta {
  color: var(--nb-text-muted);
}

.outstanding__party-amount {
  font-weight: 600;
  text-align: right;
}

@media (max-width: 639px) {
  .outstanding__party-row {
    grid-template-columns: 1fr auto;
  }

  .outstanding__party-meta {
    display: none;
  }
}
</style>
