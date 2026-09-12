<script setup lang="ts">
/**
 * 外部往来页：双视图。
 *
 *  1. 「流水」——逐条记录，走 /external-transactions，字段用驼峰
 *     FlowType / RelatedParty。
 *  2. 「未结清业务组」——按关联连通分量聚合，走
 *     /analytics/external-outstanding。
 *
 * 两个视角的筛选参数完全不同（列表用 type/flowType/relatedParty/…，
 * 业务组用 asOf/status/relatedParty），因此各自维护状态，不共用筛选栏。
 *
 * 列表接口不返回 relatedTransactions，只有用户打开详情时才请求单条详情。
 */
import { computed, onMounted, ref, watch } from 'vue'

import { useMediaQuery } from '@vueuse/core'
import { ElMessageBox } from 'element-plus'

import DataState from '@/components/common/DataState.vue'
import ActiveFilters from '@/components/common/ActiveFilters.vue'
import OutstandingGroups from '@/components/common/OutstandingGroups.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import ExternalForm from '@/components/forms/ExternalForm.vue'
import ExternalFilterBar from '@/components/layout/ExternalFilterBar.vue'
import { externalTransactionsApi } from '@/api'
import { useHistoricalEdit } from '@/composables/useHistoricalEdit'
import { useAnalyticsStore } from '@/stores/analytics'
import { useDictionaryStore } from '@/stores/dictionary'
import { useTransactionsStore } from '@/stores/transactions'
import type { ExternalTransactionQuery } from '@/types/api'
import type {
  ExternalTransaction,
  ExternalTransactionDetail,
  RelatedTransactionSummary,
} from '@/types/models'
import type { OutstandingStatus } from '@/types/analytics'
import { localDateString, formatDateDisplay } from '@/utils/date'
import { formatAmount, formatMoney, parseIds } from '@/utils/format'
import { toExternalFilterChips } from '@/utils/filterLabels'

const transactions = useTransactionsStore()
const analytics = useAnalyticsStore()
const dictionary = useDictionaryStore()
const historical = useHistoricalEdit()
const isNarrow = useMediaQuery('(max-width: 639px)')

type ViewMode = 'flows' | 'groups'
const view = ref<ViewMode>('flows')

/* ------------------------------- 流水视图 ------------------------------- */

const rows = computed(() => transactions.externalRows)
const isEmpty = computed(() => !transactions.externalLoading && rows.value.length === 0)

const drawerOpen = ref(false)
const editing = ref<ExternalTransaction | null>(null)
const formMode = ref<'create' | 'edit'>('create')
const formRef = ref<InstanceType<typeof ExternalForm> | null>(null)
const filterRef = ref<InstanceType<typeof ExternalFilterBar> | null>(null)

const PAGE_SIZES = [20, 50, 100, 200]
const activeFilterChips = computed(() => toExternalFilterChips(transactions.externalQuery))

/* ---------------------------- 业务组视图状态 ---------------------------- */

const groupFilters = ref<{
  asOf: string
  status: '' | OutstandingStatus
  relatedParty: string
}>({
  asOf: localDateString(),
  status: '',
  relatedParty: '',
})

const STATUS_OPTIONS: Array<{ label: string; value: OutstandingStatus }> = [
  { label: '未结清', value: 'open' },
  { label: '已结清', value: 'settled' },
  { label: '流入超额', value: 'overpaid' },
  { label: '无匹配流入', value: 'unmatched-in' },
]

/* -------------------------------- 详情弹窗 ------------------------------- */

const detailOpen = ref(false)
const detailLoading = ref(false)
const detail = ref<ExternalTransactionDetail | null>(null)
const detailError = ref<string | null>(null)

/* --------------------------------- 加载 --------------------------------- */

function loadFlows(): void {
  void transactions.loadExternalTransactions({ page: transactions.externalPage })
}

function loadGroups(): void {
  void analytics.loadOutstanding({
    asOf: groupFilters.value.asOf || undefined,
    status: groupFilters.value.status || undefined,
    relatedParty: groupFilters.value.relatedParty || undefined,
  })
}

onMounted(() => {
  void transactions.loadExternalTransactions({ page: 1 })
})

// 首次切到业务组视图时才请求，避免进页面就多打一个计算量较大的接口。
watch(view, (mode, previous) => {
  if (mode === 'groups' && previous !== 'groups') loadGroups()
})

watch(
  () => [groupFilters.value.status, groupFilters.value.relatedParty],
  () => {
    if (view.value === 'groups') loadGroups()
  },
)

/* --------------------------------- 操作 --------------------------------- */

function handleSearch(query: ExternalTransactionQuery): void {
  void transactions.applyExternalQuery(query)
}

function openCreate(): void {
  formMode.value = 'create'
  editing.value = null
  drawerOpen.value = true
}

function openEdit(row: ExternalTransaction): void {
  formMode.value = 'edit'
  editing.value = row
  drawerOpen.value = true
}

function resetDrawerState(): void {
  editing.value = null
}

async function requestClose(done?: () => void): Promise<void> {
  if (formRef.value?.hasUnsavedChanges()) {
    try {
      await ElMessageBox.confirm('当前内容尚未保存，确定放弃这些修改吗？', '放弃修改', {
        confirmButtonText: '放弃修改',
        cancelButtonText: '继续编辑',
        type: 'warning',
      })
    } catch {
      return
    }
  }
  if (done) done()
  else drawerOpen.value = false
}

function handleBeforeClose(done: () => void): void {
  void requestClose(done)
}

function handleSaved(): void {
  void transactions.loadExternalTransactions()
}

async function handleDelete(row: ExternalTransaction): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除 ${formatDateDisplay(row.FlowDate)} 与「${row.RelatedParty}」的这笔往来吗？此操作不可撤销。`,
      '删除往来记录',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }

  const ok = await historical.remove(row.FlowDate, () =>
    transactions.deleteExternalTransaction(row.ID),
  )
  if (ok && view.value === 'groups') loadGroups()
}

/** 只有用户主动查看详情时才请求单条详情接口。 */
async function openDetail(row: ExternalTransaction): Promise<void> {
  detailOpen.value = true
  detailLoading.value = true
  detailError.value = null
  detail.value = null
  try {
    detail.value = await externalTransactionsApi.getExternalTransaction(row.ID)
  } catch (error) {
    detailError.value = error instanceof Error ? error.message : '加载详情失败'
  } finally {
    detailLoading.value = false
  }
}

function cannotDelete(row: ExternalTransaction): boolean {
  return historical.isOutsideWindow(row.FlowDate)
}

function relatedCount(row: ExternalTransaction): number {
  return parseIds(row.RelatedID).length
}

function directionLabel(type: ExternalTransaction['Type']): string {
  return type === 'OUT' ? '流出' : '流入'
}
</script>

<template>
  <div class="external">
    <PageHeader
      title="往来"
      description="记录借出、垫付、归还等现金往来；这些记录影响现金，但不计入普通收支。"
    >
      <template #actions>
        <el-button type="primary" @click="openCreate">添加往来</el-button>
      </template>
    </PageHeader>

    <!-- 视图切换 -->
    <div class="external__switch" role="tablist" aria-label="视图">
      <button
        type="button"
        role="tab"
        class="external__switch-btn"
        :class="{ 'is-active': view === 'flows' }"
        :aria-selected="view === 'flows'"
        @click="view = 'flows'"
      >
        流水
      </button>
      <button
        type="button"
        role="tab"
        class="external__switch-btn"
        :class="{ 'is-active': view === 'groups' }"
        :aria-selected="view === 'groups'"
        @click="view = 'groups'"
      >
        往来业务组
      </button>
    </div>

    <!-- ------------------------------ 流水视图 ------------------------------ -->
    <template v-if="view === 'flows'">
      <ExternalFilterBar
        ref="filterRef"
        :loading="transactions.externalLoading"
        @search="handleSearch"
      />
      <ActiveFilters
        :chips="activeFilterChips"
        @remove="(key) => filterRef?.removeFilter(key)"
        @clear="filterRef?.reset()"
      />

      <section class="nb-card external__panel">
        <header class="external__toolbar">
          <p class="external__count">
            共 <strong class="tabular">{{ transactions.externalTotal }}</strong> 条往来记录
          </p>
          <div class="external__toolbar-right">
            <el-select
              :model-value="transactions.externalLimit"
              class="external__page-size"
              @change="
                (size: number) => {
                  transactions.externalLimit = size
                  void transactions.loadExternalTransactions({ page: 1 })
                }
              "
            >
              <el-option
                v-for="size in PAGE_SIZES"
                :key="size"
                :label="`每页 ${size} 条`"
                :value="size"
              />
            </el-select>
          </div>
        </header>

        <DataState
          :loading="transactions.externalLoading"
          :error="transactions.externalError"
          :empty="isEmpty"
          empty-text="没有符合条件的往来记录"
          empty-hint="外部往来不计入日常收支，用于记录借出、垫付与归还。"
          :skeleton-rows="5"
          @retry="loadFlows"
        >
          <el-table v-if="!isNarrow" :data="rows" stripe>
            <el-table-column label="日期" width="118">
              <template #default="{ row }">
                <span class="tabular">{{ formatDateDisplay(row.FlowDate) }}</span>
              </template>
            </el-table-column>

            <el-table-column label="方向" width="82">
              <template #default="{ row }">
                <!-- 用"流入/流出"而非"收/支"，与经营收支区分开 -->
                <span :class="row.Type === 'IN' ? 'nb-amount--income' : 'nb-amount--expense'">
                  {{ directionLabel(row.Type) }}
                </span>
              </template>
            </el-table-column>

            <el-table-column prop="FlowType" label="往来类型" width="112" show-overflow-tooltip />
            <el-table-column prop="RelatedParty" label="往来方" width="112" show-overflow-tooltip />
            <el-table-column prop="Description" label="描述" min-width="160" show-overflow-tooltip />

            <el-table-column label="关联" width="96">
              <template #default="{ row }">
                <el-button
                  v-if="relatedCount(row) > 0"
                  link
                  type="primary"
                  @click="openDetail(row)"
                >
                  关联 {{ relatedCount(row) }} 条
                </el-button>
                <span v-else class="external__empty-cell">--</span>
              </template>
            </el-table-column>

            <el-table-column label="金额" width="132" align="right">
              <template #default="{ row }">
                <span
                  class="nb-amount tabular"
                  :class="row.Type === 'IN' ? 'nb-amount--income' : 'nb-amount--expense'"
                >
                  {{ row.Type === 'IN' ? '+' : '-' }}{{ formatAmount(row.Amount) }}
                </span>
              </template>
            </el-table-column>

            <el-table-column label="操作" width="132" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
                <el-button
                  link
                  type="danger"
                  :disabled="cannotDelete(row)"
                  :title="cannotDelete(row) ? '已超出编辑窗口，不能删除历史记录' : undefined"
                  @click="handleDelete(row)"
                >
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <!-- 窄屏卡片 -->
          <ul v-else class="external__cards">
            <li v-for="row in rows" :key="row.ID" class="external__card">
              <div class="external__card-head">
                <span class="tabular external__card-date">{{ formatDateDisplay(row.FlowDate) }}</span>
                <span
                  class="nb-amount tabular"
                  :class="row.Type === 'IN' ? 'nb-amount--income' : 'nb-amount--expense'"
                >
                  {{ row.Type === 'IN' ? '+' : '-' }}{{ formatMoney(row.Amount) }}
                </span>
              </div>
              <p class="external__card-title">{{ row.Description }}</p>
              <p class="external__card-meta">
                <span :class="row.Type === 'IN' ? 'nb-amount--income' : 'nb-amount--expense'">
                  {{ directionLabel(row.Type) }}
                </span>
                · {{ row.FlowType }} · {{ row.RelatedParty }}
              </p>
              <p v-if="relatedCount(row) > 0" class="external__card-meta">
                <el-button link type="primary" @click="openDetail(row)">
                  查看关联的 {{ relatedCount(row) }} 条记录
                </el-button>
              </p>
              <div class="external__card-actions">
                <el-button size="small" @click="openEdit(row)">编辑</el-button>
                <el-button
                  size="small"
                  type="danger"
                  plain
                  :disabled="cannotDelete(row)"
                  @click="handleDelete(row)"
                >
                  删除
                </el-button>
              </div>
            </li>
          </ul>
        </DataState>

        <footer v-if="transactions.externalTotal > 0" class="external__footer">
          <el-pagination
            :current-page="transactions.externalPage"
            :page-size="transactions.externalLimit"
            :total="transactions.externalTotal"
            :layout="isNarrow ? 'prev, pager, next' : 'total, prev, pager, next, jumper'"
            :pager-count="isNarrow ? 5 : 7"
            background
            @current-change="(page: number) => transactions.loadExternalTransactions({ page })"
          />
        </footer>
      </section>
    </template>

    <!-- ---------------------------- 业务组视图 ---------------------------- -->
    <template v-else>
      <section class="nb-card external__group-filter">
        <p class="external__group-help">
          关联后的流出与流入会作为一个整体计算未偿金额；“无匹配流入”不一定是错误，请按实际业务确认。
        </p>
        <label class="external__filter-field">
          <span class="external__filter-label">截止日期</span>
          <el-date-picker
            v-model="groupFilters.asOf"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="今天"
            class="external__filter-control"
            @change="loadGroups"
          />
        </label>

        <label class="external__filter-field">
          <span class="external__filter-label">状态</span>
          <el-select v-model="groupFilters.status" placeholder="全部" clearable>
            <el-option
              v-for="option in STATUS_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </label>

        <!--
          候选往来方来自**字典**，不是 `response.byParty`。
          byParty 只汇总状态为 open 的组：切到「已结清」或「流入超额」时它会
          变成空数组，下拉框随即清空；而且多往来方的组在 byParty 里叫合成的
          `Multiple`，把它当 relatedParty 发给后端匹配不到任何真实组。
          用字典还有一个好处：选项不会随当前筛选结果不断收窄。
        -->
        <label class="external__filter-field">
          <span class="external__filter-label">往来方</span>
          <el-select v-model="groupFilters.relatedParty" placeholder="全部" clearable filterable>
            <el-option
              v-for="name in dictionary.relatedPartyNames"
              :key="name"
              :label="name"
              :value="name"
            />
          </el-select>
        </label>
      </section>

      <DataState
        :loading="analytics.outstandingLoading"
        :error="analytics.outstandingError"
        :empty="(analytics.outstanding?.groups.length ?? 0) === 0"
        empty-text="没有符合条件的往来组"
        empty-hint="调整截止日期或状态筛选后再试。"
        :skeleton-rows="4"
        @retry="loadGroups"
      >
        <OutstandingGroups v-if="analytics.outstanding" :response="analytics.outstanding" />
      </DataState>
    </template>

    <!-- 添加/编辑 -->
    <el-drawer
      v-model="drawerOpen"
      :title="formMode === 'edit' ? '编辑往来' : '添加往来'"
      :size="isNarrow ? '100%' : '560px'"
      :close-on-click-modal="false"
      :before-close="handleBeforeClose"
      destroy-on-close
      @opened="formRef?.focusAmount()"
      @closed="resetDrawerState"
    >
      <ExternalForm ref="formRef" :mode="formMode" :editing="editing" @saved="handleSaved" @close="requestClose()" />
    </el-drawer>

    <!-- 关联详情：只有点开才请求 -->
    <el-dialog v-model="detailOpen" title="关联记录" :width="isNarrow ? '92%' : '520px'">
      <DataState :loading="detailLoading" :error="detailError" :empty="false">
        <template v-if="detail">
          <p class="external__detail-head">
            #{{ detail.ID }} · {{ formatDateDisplay(detail.FlowDate) }} ·
            {{ detail.RelatedParty }} · {{ detail.Description }}
          </p>

          <el-table :data="detail.relatedTransactions" size="small" stripe>
            <el-table-column prop="ID" label="ID" width="70" />
            <el-table-column label="日期" width="110">
              <template #default="{ row }">
                <span class="tabular">{{ formatDateDisplay((row as RelatedTransactionSummary).FlowDate) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="方向" width="70">
              <template #default="{ row }">
                {{ directionLabel((row as RelatedTransactionSummary).Type) }}
              </template>
            </el-table-column>
            <el-table-column prop="Description" label="描述" show-overflow-tooltip />
            <el-table-column label="金额" width="110" align="right">
              <template #default="{ row }">
                <span class="tabular">{{ formatAmount((row as RelatedTransactionSummary).Amount) }}</span>
              </template>
            </el-table-column>
          </el-table>

          <el-empty
            v-if="detail.relatedTransactions.length === 0"
            description="这条记录没有已解析的关联记录"
            :image-size="60"
          />
        </template>
      </DataState>
    </el-dialog>
  </div>
</template>

<style scoped>
.external {
  display: flex;
  flex-direction: column;
  gap: clamp(0.75rem, 2vw, 1rem);
}

/* -------------------------------- 视图切换 ------------------------------- */

.external__switch {
  display: inline-flex;
  gap: 0.25rem;
  align-self: flex-start;
  padding: 0.25rem;
  background-color: var(--color-ink-100);
  border-radius: 0.625rem;
}

.external__group-help {
  grid-column: 1 / -1;
  margin: 0 0 0.25rem;
  font-size: 0.8125rem;
  line-height: 1.55;
  color: var(--nb-text-muted);
}

.external__switch-btn {
  padding: 0.4375rem 0.9375rem;
  font-size: 0.875rem;
  color: var(--nb-text-muted);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 0.4375rem;
  transition:
    background-color var(--duration-fast) var(--ease-out-soft),
    color var(--duration-fast) var(--ease-out-soft);
}

.external__switch-btn:hover {
  color: var(--nb-text);
}

.external__switch-btn.is-active {
  font-weight: 600;
  color: var(--color-brand-800);
  background-color: var(--nb-surface);
  box-shadow: var(--shadow-card);
}

/* -------------------------------- 流水视图 ------------------------------- */

.external__panel {
  padding: clamp(0.75rem, 2vw, 1.125rem);
}

.external__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.875rem;
}

.external__count {
  margin: 0;
  font-size: 0.875rem;
  color: var(--nb-text-muted);
}

.external__count strong {
  color: var(--nb-text);
}

.external__toolbar-right {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.external__page-size {
  width: 8.5rem;
}

.external__empty-cell {
  color: var(--nb-text-subtle);
}

.external__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.875rem;
}

.external__cards {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.external__card {
  padding: 0.875rem;
  border: 1px solid var(--nb-border);
  border-radius: 0.75rem;
}

.external__card-head {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  justify-content: space-between;
}

.external__card-date {
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.external__card-title {
  margin: 0.375rem 0 0.25rem;
  font-weight: 500;
}

.external__card-meta {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
}

.external__card-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 0.625rem;
}

/* ------------------------------- 业务组筛选 ------------------------------ */

.external__group-filter {
  display: grid;
  gap: 0.75rem 1rem;
  padding: 0.875rem 1rem;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr));
}

.external__filter-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.external__filter-label {
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.external__filter-field :deep(.el-select),
.external__filter-control {
  width: 100%;
}

.external__detail-head {
  padding-bottom: 0.625rem;
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
  border-bottom: 1px solid var(--nb-border);
}
</style>
