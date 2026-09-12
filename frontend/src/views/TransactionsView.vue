<script setup lang="ts">
/**
 * 日常收支页。
 *
 * 数据流：筛选栏 → store.applyTransactionQuery（页码重置为 1）
 *        → 表格 / 窄屏卡片列表 → 分页
 *
 * 写操作遵循手册「写操作后的缓存失效」：
 * 增/改/删成功后**重新请求当前列表**，不自行修改本地数组，
 * 否则后端的排序与页码容易和前端不一致。
 *
 * 危险操作（删除、历史修改）都有二次确认；
 * 删除没有确认绕过机制，超出编辑窗口时直接禁用按钮。
 */
import { computed, onMounted, ref } from 'vue'

import { useMediaQuery } from '@vueuse/core'
import { ElMessageBox } from 'element-plus'

import DataState from '@/components/common/DataState.vue'
import ActiveFilters from '@/components/common/ActiveFilters.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import TransactionForm from '@/components/forms/TransactionForm.vue'
import TransactionFilterBar from '@/components/layout/TransactionFilterBar.vue'
import { useHistoricalEdit } from '@/composables/useHistoricalEdit'
import { useTransactionsStore } from '@/stores/transactions'
import type { TransactionQuery } from '@/types/api'
import type { Transaction } from '@/types/models'
import { formatDateDisplay } from '@/utils/date'
import { formatAmount, formatMoney, parseTags } from '@/utils/format'
import { toTransactionFilterChips } from '@/utils/filterLabels'

const transactions = useTransactionsStore()
const historical = useHistoricalEdit()

/** 窄屏改用卡片列表：表格在手机上横向滚动体验很差。 */
const isNarrow = useMediaQuery('(max-width: 639px)')

const drawerOpen = ref(false)
const editing = ref<Transaction | null>(null)
const formMode = ref<'create' | 'edit'>('create')
/** 用于在抽屉打开动画结束后把焦点交给金额输入框。 */
const formRef = ref<InstanceType<typeof TransactionForm> | null>(null)
const filterRef = ref<InstanceType<typeof TransactionFilterBar> | null>(null)

const rows = computed(() => transactions.transactionRows)
const isEmpty = computed(() => !transactions.transactionLoading && rows.value.length === 0)
const activeFilterChips = computed(() => toTransactionFilterChips(transactions.transactionQuery))

const PAGE_SIZES = [20, 50, 100, 200]

onMounted(() => {
  void transactions.loadTransactions({ page: 1 })
})

function handleSearch(query: TransactionQuery): void {
  void transactions.applyTransactionQuery(query)
}

function openCreate(): void {
  formMode.value = 'create'
  editing.value = null
  drawerOpen.value = true
}

function openEdit(row: Transaction): void {
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

/** 新增/修改成功后重拉当前页，保证排序与计数与服务端一致。 */
function handleSaved(): void {
  void transactions.loadTransactions()
}

async function handleDelete(row: Transaction): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除 ${formatDateDisplay(row.BillDate)} 的「${row.Description}」吗？此操作不可撤销。`,
      '删除记录',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return // 用户取消
  }

  // 删除没有确认绕过机制；超出窗口时 remove() 会给出明确原因。
  await historical.remove(row.BillDate, () => transactions.deleteTransaction(row.ID))
}

function handlePageChange(page: number): void {
  void transactions.loadTransactions({ page })
}

function handleSizeChange(limit: number): void {
  transactions.transactionLimit = limit
  // 每页条数变化后回到第一页，避免页码越界
  void transactions.loadTransactions({ page: 1 })
}

/** 删除按钮是否应预先禁用：以编辑窗口为准，最终仍以服务端响应为准。 */
function cannotDelete(row: Transaction): boolean {
  return historical.isOutsideWindow(row.BillDate)
}

function deleteTitle(row: Transaction): string | undefined {
  return cannotDelete(row) ? '已超出编辑窗口，不能删除历史记录' : undefined
}
</script>

<template>
  <div class="ledger">
    <PageHeader title="流水" description="记录并核对普通收入与支出；外部借还款请前往“往来”。">
      <template #actions>
        <el-button type="primary" @click="openCreate">添加记录</el-button>
      </template>
    </PageHeader>

    <TransactionFilterBar
      ref="filterRef"
      :loading="transactions.transactionLoading"
      @search="handleSearch"
    />
    <ActiveFilters
      :chips="activeFilterChips"
      @remove="(key) => filterRef?.removeFilter(key)"
      @clear="filterRef?.reset()"
    />

    <section class="nb-card ledger__panel">
      <header class="ledger__toolbar">
        <p class="ledger__count">
          共 <strong class="tabular">{{ transactions.transactionTotal }}</strong> 条记录
        </p>

        <div class="ledger__toolbar-right">
          <el-select
            :model-value="transactions.transactionLimit"
            class="ledger__page-size"
            size="default"
            @change="handleSizeChange"
          >
            <el-option v-for="size in PAGE_SIZES" :key="size" :label="`每页 ${size} 条`" :value="size" />
          </el-select>
        </div>
      </header>

      <DataState
        :loading="transactions.transactionLoading"
        :error="transactions.transactionError"
        :empty="isEmpty"
        empty-text="没有符合条件的记录"
        empty-hint="试试放宽筛选条件，或添加一条新记录。"
        :skeleton-rows="6"
        @retry="transactions.loadTransactions()"
      >
        <!-- 宽屏：表格 -->
        <el-table v-if="!isNarrow" :data="rows" class="ledger__table" stripe>
          <el-table-column label="日期" width="118">
            <template #default="{ row }">
              <span class="tabular">{{ formatDateDisplay(row.BillDate) }}</span>
            </template>
          </el-table-column>

          <el-table-column label="类型" width="76">
            <template #default="{ row }">
              <!-- 同时用文字传达方向，不只靠颜色 -->
              <span :class="row.Type === 'Income' ? 'nb-amount--income' : 'nb-amount--expense'">
                {{ row.Type === 'Income' ? '收入' : '支出' }}
              </span>
            </template>
          </el-table-column>

          <el-table-column prop="Category" label="分类" width="120" show-overflow-tooltip />
          <el-table-column prop="Subcategory" label="子分类" width="120" show-overflow-tooltip />

          <el-table-column label="描述" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">
              <span>{{ row.Description }}</span>
              <span v-if="row.Notes" class="ledger__notes" :title="row.Notes">备注</span>
            </template>
          </el-table-column>

          <el-table-column label="标签" min-width="140">
            <template #default="{ row }">
              <template v-if="parseTags(row.Tag).length > 0">
                <el-tag
                  v-for="tag in parseTags(row.Tag)"
                  :key="tag"
                  size="small"
                  type="info"
                  effect="plain"
                  class="ledger__tag"
                >
                  {{ tag }}
                </el-tag>
              </template>
              <span v-else class="ledger__empty-cell">--</span>
            </template>
          </el-table-column>

          <el-table-column label="金额" width="132" align="right">
            <template #default="{ row }">
              <span
                class="nb-amount tabular"
                :class="row.Type === 'Income' ? 'nb-amount--income' : 'nb-amount--expense'"
              >
                {{ row.Type === 'Income' ? '+' : '-' }}{{ formatAmount(row.Amount) }}
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
                :title="deleteTitle(row)"
                @click="handleDelete(row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 窄屏：卡片列表 -->
        <ul v-else class="ledger__cards">
          <li v-for="row in rows" :key="row.ID" class="ledger__card">
            <div class="ledger__card-head">
              <span class="tabular ledger__card-date">{{ formatDateDisplay(row.BillDate) }}</span>
              <span
                class="nb-amount tabular ledger__card-amount"
                :class="row.Type === 'Income' ? 'nb-amount--income' : 'nb-amount--expense'"
              >
                {{ row.Type === 'Income' ? '+' : '-' }}{{ formatMoney(row.Amount) }}
              </span>
            </div>

            <p class="ledger__card-title">{{ row.Description }}</p>

            <p class="ledger__card-meta">
              <span :class="row.Type === 'Income' ? 'nb-amount--income' : 'nb-amount--expense'">
                {{ row.Type === 'Income' ? '收入' : '支出' }}
              </span>
              · {{ row.Category }} / {{ row.Subcategory }}
            </p>

            <div v-if="parseTags(row.Tag).length > 0" class="ledger__card-tags">
              <el-tag v-for="tag in parseTags(row.Tag)" :key="tag" size="small" type="info" effect="plain">
                {{ tag }}
              </el-tag>
            </div>

            <div class="ledger__card-actions">
              <el-button size="small" @click="openEdit(row)">编辑</el-button>
              <el-button
                size="small"
                type="danger"
                plain
                :disabled="cannotDelete(row)"
                :title="deleteTitle(row)"
                @click="handleDelete(row)"
              >
                删除
              </el-button>
            </div>
          </li>
        </ul>
      </DataState>

      <footer v-if="transactions.transactionTotal > 0" class="ledger__footer">
        <el-pagination
          :current-page="transactions.transactionPage"
          :page-size="transactions.transactionLimit"
          :total="transactions.transactionTotal"
          :page-sizes="PAGE_SIZES"
          :layout="isNarrow ? 'prev, pager, next' : 'total, prev, pager, next, jumper'"
          :pager-count="isNarrow ? 5 : 7"
          background
          @current-change="handlePageChange"
        />
      </footer>
    </section>

    <!-- 添加/编辑面板：保存并继续时保持打开，形成连续添加闭环 -->
    <el-drawer
      v-model="drawerOpen"
      :title="formMode === 'edit' ? '编辑记录' : '添加记录'"
      :size="isNarrow ? '100%' : '560px'"
      :close-on-click-modal="false"
      :before-close="handleBeforeClose"
      destroy-on-close
      @opened="formRef?.focusAmount()"
      @closed="resetDrawerState"
    >
      <TransactionForm
        ref="formRef"
        :mode="formMode"
        :editing="editing"
        @saved="handleSaved"
        @close="requestClose()"
      />
    </el-drawer>
  </div>
</template>

<style scoped>
.ledger {
  display: flex;
  flex-direction: column;
  gap: clamp(0.75rem, 2vw, 1rem);
}

.ledger__panel {
  padding: clamp(0.75rem, 2vw, 1.125rem);
}

.ledger__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.875rem;
}

.ledger__count {
  margin: 0;
  font-size: 0.875rem;
  color: var(--nb-text-muted);
}

.ledger__count strong {
  color: var(--nb-text);
}

.ledger__toolbar-right {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.ledger__page-size {
  width: 8.5rem;
}

.ledger__table {
  width: 100%;
}

.ledger__table :deep(.el-table__header-wrapper) {
  position: sticky;
  top: 0;
  z-index: 2;
}

.ledger__table :deep(.el-table__row .el-button.is-link) {
  opacity: 0.55;
}

.ledger__table :deep(.el-table__row:hover .el-button.is-link),
.ledger__table :deep(.el-table__row .el-button.is-link:focus-visible) {
  opacity: 1;
}

.ledger__notes {
  margin-left: 0.375rem;
  padding: 0.0625rem 0.3125rem;
  font-size: 0.6875rem;
  color: var(--nb-text-muted);
  background-color: var(--color-ink-100);
  border-radius: 0.25rem;
}

.ledger__tag {
  margin-right: 0.25rem;
}

.ledger__empty-cell {
  color: var(--nb-text-subtle);
}

.ledger__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.875rem;
}

/* -------------------------------- 窄屏卡片 ------------------------------- */

.ledger__cards {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.ledger__card {
  padding: 0.875rem;
  border: 1px solid var(--nb-border);
  border-radius: 0.75rem;
}

.ledger__card-head {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  justify-content: space-between;
}

.ledger__card-date {
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.ledger__card-amount {
  font-size: 1rem;
  font-weight: 600;
}

.ledger__card-title {
  margin: 0.375rem 0 0.25rem;
  font-weight: 500;
}

.ledger__card-meta {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--nb-text-muted);
}

.ledger__card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.5rem;
}

.ledger__card-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 0.625rem;
}

.ledger__card-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
