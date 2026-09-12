<script setup lang="ts">
/**
 * 字典设置。
 *
 * 四组字典都只支持新增与重命名（后端没有 DELETE 接口），
 * 且重命名会**级联更新引用它们的流水**，因此成功后必须同时失效：
 *   字典缓存 → 对应流水列表 → 全部分析结果 → status 计数
 * 这条链路由 dictionary store 的 refreshAfterDictionaryWrite 与
 * analyticsStore.invalidate() 共同完成。
 *
 * 字段大小写注意：往来类型字典是 `Flowtype`（小写 t）、
 * 往来方字典是 `Relatedparty`（小写 p），与流水上的驼峰不同名。
 */
import { computed, onMounted, ref } from 'vue'

import { ElMessage } from 'element-plus'

import DictionarySection, { type DictionaryField } from '@/components/common/DictionarySection.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import { dictionariesApi } from '@/api'
import { useAnalyticsStore } from '@/stores/analytics'
import { useDictionaryStore } from '@/stores/dictionary'
import { useTransactionsStore } from '@/stores/transactions'
import { ApiError } from '@/types/api'
import type { TransactionType } from '@/types/models'

const dictionary = useDictionaryStore()
const analytics = useAnalyticsStore()
const transactions = useTransactionsStore()

const TAB = ref<'categories' | 'tags' | 'flowTypes' | 'parties'>('categories')
/** 正在提交的项标识，用于禁用对应行的操作。 */
const submittingKey = ref<string | null>(null)

const TYPE_OPTIONS = [
  { label: '支出', value: 'Expense' },
  { label: '收入', value: 'Income' },
]

const APPLIES_OPTIONS = [
  { label: '仅支出', value: 'Expense' },
  { label: '仅收入', value: 'Income' },
  { label: '收支通用', value: 'Both' },
]

onMounted(async () => {
  try {
    await dictionary.loadAll()
  } catch {
    // 错误由字典 store 记录，页面显示空表
  }
})

/* ------------------------------- 分类 ------------------------------- */

const categoryRows = computed(() =>
  dictionary.categories.map((item) => ({
    key: `${item.Type}|${item.Category}|${item.Subcategory}`,
    Type: item.Type === 'Expense' ? '支出' : '收入',
    Category: item.Category,
    Subcategory: item.Subcategory,
    Description: item.Description || '--',
    // 传给重命名接口的原始值
    rawType: item.Type,
    rawCategory: item.Category,
    rawSubcategory: item.Subcategory,
  })),
)

// 窄屏下隐藏"说明"与"类型"，把宽度让给两个分类名
const categoryColumns = [
  { key: 'Type', label: '类型', width: 72, hideOnNarrow: true },
  { key: 'Category', label: '一级分类', minWidth: 104 },
  { key: 'Subcategory', label: '二级分类', minWidth: 104 },
  { key: 'Description', label: '说明', minWidth: 160, hideOnNarrow: true },
]

const categoryCreateFields: DictionaryField[] = [
  { key: 'Type', label: '收支类型', type: 'select', options: TYPE_OPTIONS, required: true },
  { key: 'Category', label: '一级分类', type: 'text', required: true },
  { key: 'Subcategory', label: '二级分类', type: 'text', required: true },
  { key: 'Description', label: '说明（可选）', type: 'text' },
]

const categoryRenameFields: DictionaryField[] = [
  { key: 'newCategory', label: '新的一级分类名', type: 'text', required: true },
  { key: 'newSubcategory', label: '新的二级分类名', type: 'text', required: true },
  { key: 'newDescription', label: '说明（可选）', type: 'text' },
]

/* ------------------------------- 标签 ------------------------------- */

const tagRows = computed(() =>
  dictionary.tags.map((item) => ({
    key: item.Tag,
    Tag: item.Tag,
    Description: item.Description || '--',
    AppliesTo:
      item.AppliesTo === 'Expense' ? '仅支出' : item.AppliesTo === 'Income' ? '仅收入' : '收支通用',
  })),
)

const tagColumns = [
  { key: 'Tag', label: '标签', minWidth: 110 },
  { key: 'Description', label: '说明', minWidth: 180, hideOnNarrow: true },
  { key: 'AppliesTo', label: '适用范围', width: 96 },
]

const tagCreateFields: DictionaryField[] = [
  { key: 'Tag', label: '标签名', type: 'text', required: true },
  { key: 'Description', label: '说明（可选）', type: 'text' },
  { key: 'AppliesTo', label: '适用范围', type: 'select', options: APPLIES_OPTIONS },
]

const tagRenameFields: DictionaryField[] = [
  { key: 'newTag', label: '新的标签名', type: 'text', required: true },
  { key: 'newDescription', label: '说明（可选）', type: 'text' },
  { key: 'newAppliesTo', label: '适用范围', type: 'select', options: APPLIES_OPTIONS },
]

/* ----------------------------- 往来类型 ----------------------------- */

const flowTypeRows = computed(() =>
  dictionary.flowTypes.map((item) => ({ key: item.Flowtype, Flowtype: item.Flowtype })),
)

const flowTypeColumns = [{ key: 'Flowtype', label: '往来类型', minWidth: 160 }]

const flowTypeCreateFields: DictionaryField[] = [
  { key: 'Flowtype', label: '往来类型名', type: 'text', required: true },
]

const flowTypeRenameFields: DictionaryField[] = [
  { key: 'newFlowtype', label: '新的名称', type: 'text', required: true },
]

/* ------------------------------ 往来方 ------------------------------ */

const partyRows = computed(() =>
  dictionary.relatedParties.map((item) => ({
    key: item.Relatedparty,
    Relatedparty: item.Relatedparty,
  })),
)

const partyColumns = [{ key: 'Relatedparty', label: '往来方', minWidth: 160 }]

const partyCreateFields: DictionaryField[] = [
  { key: 'Relatedparty', label: '往来方名称', type: 'text', required: true },
]

const partyRenameFields: DictionaryField[] = [
  { key: 'newRelatedparty', label: '新的名称', type: 'text', required: true },
]

/* ------------------------------ 提交逻辑 ------------------------------ */

/**
 * 每个 Tab 各有一个 DictionarySection 实例（el-tabs 会保留已挂载的页签），
 * 因此不能用单个 ref —— 那样最后一个挂载的实例会覆盖前面的，
 * 结果就是"在分类页点确定，关掉的却是标签页的弹窗"。
 * 用按 Tab key 索引的映射，每次只操作当前页签的实例。
 */
type SectionInstance = InstanceType<typeof DictionarySection>
const sections = ref<Record<string, SectionInstance | null>>({})

function setSection(key: string) {
  return (el: unknown): void => {
    sections.value[key] = (el as SectionInstance) ?? null
  }
}

/** 当前页签对应的实例。 */
function activeSection(): SectionInstance | null {
  return sections.value[TAB.value] ?? null
}

/** 冲突（409）时保留输入让用户改名，不自动重试。 */
function handleError(error: unknown, onConflict: (message: string) => void): void {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      onConflict(error.message)
      return
    }
    ElMessage.error(error.message)
    return
  }
  ElMessage.error('操作失败，请稍后重试')
}

/**
 * 字典写成功后的统一收尾。
 * 重命名会级联更新已有流水，因此流水列表与全部分析都必须失效。
 */
async function afterDictionaryWrite(
  scope: 'billCategory' | 'billTag' | 'exFlowType' | 'exRelatedParty',
): Promise<void> {
  await dictionary.refreshAfterDictionaryWrite(scope)
  analytics.invalidate()
  await dictionary.syncCounts()
}

async function createCategory(payload: Record<string, string>): Promise<void> {
  try {
    await dictionariesApi.createBillCategory({
      Type: payload.Type as TransactionType,
      Category: payload.Category,
      Subcategory: payload.Subcategory,
      Description: payload.Description ?? '',
    })
    ElMessage.success('已新增分类')
    activeSection()?.closeOnSuccess()
    await afterDictionaryWrite('billCategory')
  } catch (error) {
    handleError(error, (message) => activeSection()?.reportConflict(message))
  }
}

async function renameCategory(
  target: Record<string, unknown> & { key: string },
  payload: Record<string, string>,
): Promise<void> {
  submittingKey.value = target.key
  try {
    await dictionariesApi.renameBillCategory(
      String(target.rawCategory),
      String(target.rawSubcategory),
      {
        newCategory: payload.newCategory || undefined,
        newSubcategory: payload.newSubcategory || undefined,
        newDescription: payload.newDescription,
      },
    )
    ElMessage.success('已重命名，相关流水已同步更新')
    activeSection()?.closeOnSuccess()
    await afterDictionaryWrite('billCategory')
    await transactions.loadTransactions()
  } catch (error) {
    handleError(error, (message) => activeSection()?.reportConflict(message))
  } finally {
    submittingKey.value = null
  }
}

async function createTag(payload: Record<string, string>): Promise<void> {
  try {
    await dictionariesApi.createBillTag({
      Tag: payload.Tag,
      Description: payload.Description ?? '',
      AppliesTo: (payload.AppliesTo || undefined) as 'Income' | 'Expense' | 'Both' | undefined,
    })
    ElMessage.success('已新增标签')
    activeSection()?.closeOnSuccess()
    await afterDictionaryWrite('billTag')
  } catch (error) {
    handleError(error, (message) => activeSection()?.reportConflict(message))
  }
}

async function renameTag(
  target: Record<string, unknown> & { key: string },
  payload: Record<string, string>,
): Promise<void> {
  submittingKey.value = target.key
  try {
    await dictionariesApi.renameBillTag(String(target.Tag), {
      newTag: payload.newTag || undefined,
      newDescription: payload.newDescription,
      newAppliesTo: (payload.newAppliesTo || undefined) as
        | 'Income'
        | 'Expense'
        | 'Both'
        | undefined,
    })
    ElMessage.success('已重命名，相关流水已同步更新')
    activeSection()?.closeOnSuccess()
    await afterDictionaryWrite('billTag')
    await transactions.loadTransactions()
  } catch (error) {
    handleError(error, (message) => activeSection()?.reportConflict(message))
  } finally {
    submittingKey.value = null
  }
}

async function createFlowType(payload: Record<string, string>): Promise<void> {
  try {
    await dictionariesApi.createExFlowType(payload.Flowtype)
    ElMessage.success('已新增往来类型')
    activeSection()?.closeOnSuccess()
    await afterDictionaryWrite('exFlowType')
  } catch (error) {
    handleError(error, (message) => activeSection()?.reportConflict(message))
  }
}

async function renameFlowType(
  target: Record<string, unknown> & { key: string },
  payload: Record<string, string>,
): Promise<void> {
  submittingKey.value = target.key
  try {
    await dictionariesApi.renameExFlowType(String(target.Flowtype), payload.newFlowtype)
    ElMessage.success('已重命名，相关往来记录已同步更新')
    activeSection()?.closeOnSuccess()
    await afterDictionaryWrite('exFlowType')
    await transactions.loadExternalTransactions()
  } catch (error) {
    handleError(error, (message) => activeSection()?.reportConflict(message))
  } finally {
    submittingKey.value = null
  }
}

async function createParty(payload: Record<string, string>): Promise<void> {
  try {
    await dictionariesApi.createExRelatedParty(payload.Relatedparty)
    ElMessage.success('已新增往来方')
    activeSection()?.closeOnSuccess()
    await afterDictionaryWrite('exRelatedParty')
  } catch (error) {
    handleError(error, (message) => activeSection()?.reportConflict(message))
  }
}

async function renameParty(
  target: Record<string, unknown> & { key: string },
  payload: Record<string, string>,
): Promise<void> {
  submittingKey.value = target.key
  try {
    await dictionariesApi.renameExRelatedParty(String(target.Relatedparty), payload.newRelatedparty)
    ElMessage.success('已重命名，相关往来记录已同步更新')
    activeSection()?.closeOnSuccess()
    await afterDictionaryWrite('exRelatedParty')
    await transactions.loadExternalTransactions()
  } catch (error) {
    handleError(error, (message) => activeSection()?.reportConflict(message))
  } finally {
    submittingKey.value = null
  }
}
</script>

<template>
  <div class="settings">
    <PageHeader
      title="分类与标签"
      description="维护录入时使用的分类、标签、往来类型和往来方。这里只支持新增与重命名，重命名会同步更新已有记录。"
    />
    <div class="settings__surface nb-data-surface">
      <el-tabs v-model="TAB" class="settings__tabs">
      <el-tab-pane label="分类" name="categories">
        <DictionarySection
          :ref="setSection('categories')"
          title="分类"
          description="普通流水的收支类型 / 一级分类 / 二级分类。重命名会级联更新引用它的流水。"
          :rows="categoryRows"
          :columns="categoryColumns"
          :create-fields="categoryCreateFields"
          :rename-fields="categoryRenameFields"
          :loading="dictionary.loading"
          :submitting-key="submittingKey"
          @create="createCategory"
          @rename="renameCategory"
        />
      </el-tab-pane>

      <el-tab-pane label="标签" name="tags">
        <DictionarySection
          :ref="setSection('tags')"
          title="标签"
          description="标签的适用范围决定它在录入时是否出现：仅支出 / 仅收入 / 收支通用。"
          :rows="tagRows"
          :columns="tagColumns"
          :create-fields="tagCreateFields"
          :rename-fields="tagRenameFields"
          :loading="dictionary.loading"
          :submitting-key="submittingKey"
          @create="createTag"
          @rename="renameTag"
        />
      </el-tab-pane>

      <el-tab-pane label="往来类型" name="flowTypes">
        <DictionarySection
          :ref="setSection('flowTypes')"
          title="往来类型"
          description="外部往来的业务类型，例如借款、还款、投资款。"
          :rows="flowTypeRows"
          :columns="flowTypeColumns"
          :create-fields="flowTypeCreateFields"
          :rename-fields="flowTypeRenameFields"
          :loading="dictionary.loading"
          :submitting-key="submittingKey"
          @create="createFlowType"
          @rename="renameFlowType"
        />
      </el-tab-pane>

      <el-tab-pane label="往来方" name="parties">
        <DictionarySection
          :ref="setSection('parties')"
          title="往来方"
          description="与谁发生外部往来，例如个人、家庭成员或机构。"
          :rows="partyRows"
          :columns="partyColumns"
          :create-fields="partyCreateFields"
          :rename-fields="partyRenameFields"
          :loading="dictionary.loading"
          :submitting-key="submittingKey"
          @create="createParty"
          @rename="renameParty"
        />
      </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: clamp(0.75rem, 2vw, 1rem);
}

.settings__surface {
  padding: clamp(0.75rem, 2vw, 1.25rem);
}

.settings__tabs :deep(.el-tabs__content) {
  padding-top: 0.5rem;
}
</style>
