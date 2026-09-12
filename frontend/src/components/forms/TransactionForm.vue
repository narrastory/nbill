<script setup lang="ts">
/**
 * 普通收支表单：新增（含**连续添加**）与编辑共用。
 *
 * 连续添加的交互：
 *   原则是"保留这批记录共有的字段，清空每条都不同的字段"。
 *   因此提交后**只清空金额**并聚焦，日期/类型/分类/标签/描述全部保留。
 *   描述保留是因为它是后端必填且同批常重复（如"午餐"），清空反而增加输入量。
 *
 * 键盘闭环：
 *   Enter            → 保存并继续
 *   Ctrl/Cmd + Enter → 保存并关闭
 *
 * 字段大小写严格按后端：标签是单数 `Tag`（逗号分隔字符串），
 * 不是 `Tags`。详见 docs/frontend-backend-manual/API_REFERENCE.md。
 */

import { computed, nextTick, reactive, ref, watch } from 'vue'

import { ElInput, ElMessage, type FormInstance, type FormRules } from 'element-plus'

import { useHistoricalEdit } from '@/composables/useHistoricalEdit'
import { useDictionaryStore } from '@/stores/dictionary'
import { useTransactionsStore } from '@/stores/transactions'
import { ApiError } from '@/types/api'
import type { Transaction, TransactionType } from '@/types/models'
import { isFutureDate, localDateString } from '@/utils/date'
import { formatMoney, parseTags, serializeTags } from '@/utils/format'
import { stableFormSnapshot } from '@/utils/formSnapshot'

const props = withDefaults(
  defineProps<{
    /** create = 连续添加模式；edit = 编辑既有记录 */
    mode?: 'create' | 'edit'
    /** 编辑模式下的原始记录 */
    editing?: Transaction | null
  }>(),
  { mode: 'create', editing: null },
)

const emit = defineEmits<{
  saved: [record: Transaction]
  close: []
}>()

const dictionary = useDictionaryStore()
const transactions = useTransactionsStore()
const historical = useHistoricalEdit()

const formRef = ref<FormInstance>()
const amountRef = ref<InstanceType<typeof ElInput>>()
const submitting = ref(false)

/** 本次会话最近添加的记录（仅 create 模式展示）。 */
interface RecentRecord {
  key: number
  amount: number
  category: string
  subcategory: string
  type: TransactionType
}
const recent = ref<RecentRecord[]>([])
const RECENT_LIMIT = 5

const form = reactive({
  Type: 'Expense' as TransactionType,
  BillDate: localDateString(),
  Category: '',
  Subcategory: '',
  Description: '',
  Tags: [] as string[],
  /** 用字符串承载，便于清空为 ''；提交前再转数字。 */
  Amount: '',
  Notes: '',
})

const cleanSnapshot = ref(stableFormSnapshot(form))

function markClean(): void {
  cleanSnapshot.value = stableFormSnapshot(form)
}

function hasUnsavedChanges(): boolean {
  return stableFormSnapshot(form) !== cleanSnapshot.value
}

const isEdit = computed(() => props.mode === 'edit')

/** 后端不接受未来日期，日期选择器直接禁掉。 */
function disableFutureDate(date: Date): boolean {
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  return date.getTime() > endOfToday.getTime()
}

const categoryOptions = computed(() => dictionary.categoryNames(form.Type))
const subcategoryOptions = computed(() =>
  form.Category ? dictionary.subcategories(form.Type, form.Category) : [],
)
/** 标签候选必须按 AppliesTo 过滤 —— 后端不拦，前端必须自己挡。 */
const tagOptions = computed(() => dictionary.tagsForType(form.Type))

/* ------------------------------- 联动重置 ------------------------------- */

// 切换收支类型后，原分类/标签可能不再适用，需要清掉。
watch(
  () => form.Type,
  () => {
    if (!categoryOptions.value.includes(form.Category)) {
      form.Category = ''
    }
    form.Subcategory = ''
    const allowed = tagOptions.value.map((t) => t.Tag)
    form.Tags = form.Tags.filter((tag) => allowed.includes(tag))
  },
)

// 一级分类变化后二级分类必然失效，除非仍在候选内。
watch(
  () => form.Category,
  () => {
    if (!subcategoryOptions.value.includes(form.Subcategory)) {
      form.Subcategory = ''
    }
  },
)

/* -------------------------------- 校验 -------------------------------- */

/** 金额必须是有限正数；空值、NaN、Infinity、非正数一律拒绝。 */
function validateAmount(_rule: unknown, value: string, callback: (error?: Error) => void): void {
  const text = String(value ?? '').trim()
  if (text === '') {
    callback(new Error('请输入金额'))
    return
  }
  const numeric = Number(text)
  if (!Number.isFinite(numeric)) {
    callback(new Error('金额必须是有效数字'))
    return
  }
  if (numeric <= 0) {
    callback(new Error('金额必须大于 0'))
    return
  }
  callback()
}

function validateBillDate(_rule: unknown, value: string, callback: (error?: Error) => void): void {
  if (!value) {
    callback(new Error('请选择日期'))
    return
  }
  if (isFutureDate(value)) {
    callback(new Error('日期不能晚于今天'))
    return
  }
  callback()
}

const rules: FormRules = {
  BillDate: [{ validator: validateBillDate, trigger: 'change' }],
  Category: [{ required: true, message: '请选择一级分类', trigger: 'change' }],
  Subcategory: [{ required: true, message: '请选择二级分类', trigger: 'change' }],
  Description: [{ required: true, message: '请填写描述', trigger: 'blur' }],
  Amount: [{ validator: validateAmount, trigger: 'blur' }],
}

/* ------------------------------- 编辑模式 ------------------------------- */

watch(
  () => props.editing,
  (record) => {
    if (!record) return
    form.Type = record.Type
    form.BillDate = record.BillDate
    // 先设分类，再设子分类，避免上面的 watch 把子分类清掉。
    form.Category = record.Category
    nextTick(() => {
      form.Subcategory = record.Subcategory
      markClean()
    })
    form.Description = record.Description
    form.Tags = parseTags(record.Tag)
    form.Amount = String(record.Amount)
    form.Notes = record.Notes ?? ''
  },
  { immediate: true },
)

/* -------------------------------- 提交 -------------------------------- */

function buildPayload() {
  return {
    Type: form.Type,
    BillDate: form.BillDate,
    Category: form.Category,
    Subcategory: form.Subcategory,
    Description: form.Description.trim(),
    // 标签用英文逗号连接，后端字段名是单数 Tag。
    Tag: serializeTags(form.Tags),
    Amount: Number(form.Amount),
    Notes: form.Notes.trim(),
  }
}

/**
 * @param keepOpen true = 保存并继续（连续添加）；false = 保存并关闭
 */
async function submit(keepOpen: boolean): Promise<void> {
  if (submitting.value) return

  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  /** 连续添加时需要在请求结束后把焦点还给金额输入框。 */
  let refocusAmount = false

  submitting.value = true
  try {
    if (isEdit.value && props.editing) {
      const payload = buildPayload()
      // 超出编辑窗口时后端返回 403，由 useHistoricalEdit 负责
      // 说明会创建备份并由用户二次确认，确认后仅重试一次。
      const outcome = await historical.run(
        (confirm) => transactions.updateTransaction(props.editing!.ID, payload, confirm),
        { recordDate: props.editing.BillDate },
      )
      if (outcome === null) return // 用户取消，保持原数据

      ElMessage.success(outcome.historical ? '已修改，并已创建备份' : '已保存修改')
      markClean()
      emit('saved', { ...props.editing, ...payload })
      emit('close')
      return
    }

    const created = await transactions.createTransaction(buildPayload())

    // 最近添加：保留最近 5 条，最新的在最上面。
    recent.value = [
      {
        key: created.ID,
        amount: created.Amount,
        category: created.Category,
        subcategory: created.Subcategory,
        type: created.Type,
      },
      ...recent.value,
    ].slice(0, RECENT_LIMIT)

    ElMessage.success(`已保存：${formatMoney(created.Amount)} ${created.Subcategory}`)
    emit('saved', created)

    if (keepOpen) {
      // 连续添加：只清空金额，其余上下文保留。
      form.Amount = ''
      markClean()
      formRef.value?.clearValidate('Amount')
      refocusAmount = true
    } else {
      markClean()
      emit('close')
    }
  } catch (error) {
    // 保留表单内容，方便用户修改后重试。
    ElMessage.error(error instanceof ApiError ? error.message : '保存失败，请稍后重试')
  } finally {
    submitting.value = false
  }

  // ⚠️ 必须在 submitting 复位之后再聚焦。
  // 输入框绑定了 :disabled="submitting"，请求期间是 disabled 状态，
  // 对 disabled 元素调用 focus() 不会生效 —— 之前把 focus 写在 try 里，
  // 结果焦点始终没落到金额框上。
  if (refocusAmount) {
    await nextTick()
    amountRef.value?.focus()
  }
}

/** 换一批录入时使用：恢复到默认状态。 */
function resetForm(): void {
  form.Type = 'Expense'
  form.BillDate = localDateString()
  form.Category = ''
  form.Subcategory = ''
  form.Description = ''
  form.Tags = []
  form.Amount = ''
  form.Notes = ''
  markClean()
  formRef.value?.clearValidate()
  void nextTick(() => amountRef.value?.focus())
}

/**
 * 聚焦金额输入框。
 *
 * 由外部在合适的时机调用（抽屉的 `@opened` 事件），而不是在组件内自动执行：
 * el-drawer 的焦点陷阱会在打开动画结束后把焦点收回容器，
 * 组件自身在 setup 或 nextTick 里聚焦都会被它覆盖掉。
 */
async function focusAmount(): Promise<void> {
  await nextTick()
  amountRef.value?.focus()
}

defineExpose({ focusAmount, hasUnsavedChanges })

const isEmptyRecent = computed(() => recent.value.length === 0)
</script>

<template>
  <div class="record-form">
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      class="record-form__form"
      @submit.prevent
    >
      <div class="record-form__grid">
        <!-- 收支类型：分段控件，减少点击层级 -->
        <el-form-item label="类型" prop="Type" class="record-form__span-2">
          <el-radio-group v-model="form.Type" :disabled="submitting">
            <el-radio-button value="Expense">支出</el-radio-button>
            <el-radio-button value="Income">收入</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="日期" prop="BillDate">
          <el-date-picker
            v-model="form.BillDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            :disabled="isEdit || submitting"
            :disabled-date="disableFutureDate"
            class="record-form__full"
          />
          <p v-if="isEdit" class="record-form__hint">原始日期不可修改</p>
        </el-form-item>

        <el-form-item label="金额" prop="Amount">
          <!-- 连续添加时焦点始终回到这里，Enter 直接保存并继续 -->
          <el-input
            ref="amountRef"
            v-model="form.Amount"
            inputmode="decimal"
            placeholder="0.00"
            :disabled="submitting"
            @keyup.enter="submit(true)"
          >
            <template #prefix>¥</template>
          </el-input>
        </el-form-item>

        <el-form-item label="一级分类" prop="Category">
          <el-select
            v-model="form.Category"
            placeholder="选择分类"
            filterable
            :disabled="submitting"
            class="record-form__full"
          >
            <el-option v-for="name in categoryOptions" :key="name" :label="name" :value="name" />
          </el-select>
        </el-form-item>

        <el-form-item label="二级分类" prop="Subcategory">
          <el-select
            v-model="form.Subcategory"
            placeholder="选择子分类"
            filterable
            :disabled="!form.Category || submitting"
            class="record-form__full"
          >
            <el-option v-for="name in subcategoryOptions" :key="name" :label="name" :value="name" />
          </el-select>
        </el-form-item>

        <el-form-item label="描述" prop="Description" class="record-form__span-2">
          <el-input
            v-model="form.Description"
            placeholder="这笔钱花在哪儿了"
            maxlength="60"
            show-word-limit
            :disabled="submitting"
          />
        </el-form-item>

        <el-form-item label="标签（可多选）" prop="Tags" class="record-form__span-2">
          <el-select
            v-model="form.Tags"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择标签"
            :disabled="submitting"
            class="record-form__full"
          >
            <el-option v-for="tag in tagOptions" :key="tag.Tag" :label="tag.Tag" :value="tag.Tag" />
          </el-select>
        </el-form-item>

        <el-form-item label="备注（可选）" prop="Notes" class="record-form__span-2">
          <el-input
            v-model="form.Notes"
            type="textarea"
            :rows="2"
            placeholder="补充说明"
            :disabled="submitting"
          />
        </el-form-item>
      </div>

      <div class="record-form__actions">
        <el-button v-if="!isEdit" :disabled="submitting" @click="resetForm">重置表单</el-button>
        <div class="record-form__actions-right">
          <el-button :disabled="submitting" @click="emit('close')">取消</el-button>
          <template v-if="isEdit">
            <el-button type="primary" :loading="submitting" @click="submit(false)">
              保存修改
            </el-button>
          </template>
          <template v-else>
            <el-button :loading="submitting" @click="submit(false)">保存并关闭</el-button>
            <el-button type="primary" :loading="submitting" @click="submit(true)">
              保存并继续
            </el-button>
          </template>
        </div>
      </div>

      <p v-if="!isEdit" class="record-form__shortcut">
        保存并继续会保留日期、类型、分类、标签和描述，只清空金额。<br />
        快捷键：<kbd>Enter</kbd> 保存并继续 · <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Enter</kbd> 保存并关闭
      </p>
    </el-form>

    <!-- 连续添加时的轻量反馈，避免用户迷失在重复操作里 -->
    <section v-if="!isEdit" class="record-form__recent" aria-live="polite">
      <h3 class="record-form__recent-title">
        最近添加
        <span v-if="recent.length > 0" class="record-form__recent-count">本次 {{ recent.length }} 条</span>
      </h3>

      <p v-if="isEmptyRecent" class="record-form__recent-empty">
        保存后会在这里显示，方便确认没有漏记或重复。
      </p>

      <ul v-else class="record-form__recent-list">
        <li v-for="item in recent" :key="item.key" class="record-form__recent-item">
          <span class="record-form__recent-check" aria-hidden="true">✓</span>
          <span
            class="record-form__recent-amount"
            :class="item.type === 'Income' ? 'nb-amount--income' : 'nb-amount--expense'"
          >
            {{ formatMoney(item.amount) }}
          </span>
          <span class="record-form__recent-label">{{ item.category }} / {{ item.subcategory }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.record-form {
  display: grid;
  gap: 1.25rem;
}

/* 宽屏两栏：表单 + 最近添加；窄屏自动堆叠 */
@media (min-width: 900px) {
  .record-form {
    grid-template-columns: minmax(0, 1fr) 15rem;
    align-items: start;
  }
}

.record-form__grid {
  display: grid;
  gap: 0 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.record-form__span-2 {
  grid-column: span 2;
}

.record-form__full {
  width: 100%;
}

.record-form__hint {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: var(--nb-text-subtle);
}

/* 窄屏单列，避免下拉被压得过窄 */
@media (max-width: 639px) {
  .record-form__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .record-form__span-2 {
    grid-column: span 1;
  }
}

.record-form__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  padding-top: 0.5rem;
  margin-top: 0.25rem;
  border-top: 1px solid var(--nb-border);
}

.record-form__actions-right {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}

.record-form__shortcut {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--nb-text-subtle);
}

kbd {
  padding: 0.0625rem 0.3125rem;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  background-color: var(--color-ink-100);
  border: 1px solid var(--nb-border);
  border-radius: 0.25rem;
}

/* ------------------------------- 最近添加 ------------------------------- */

.record-form__recent {
  padding: 0.875rem;
  background-color: var(--color-brand-50);
  border: 1px solid var(--color-brand-100);
  border-radius: 0.75rem;
}

.record-form__recent-title {
  display: flex;
  gap: 0.375rem;
  align-items: baseline;
  justify-content: space-between;
  margin: 0 0 0.625rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-brand-800);
}

.record-form__recent-count {
  font-size: 0.6875rem;
  font-weight: 400;
  color: var(--color-brand-700);
}

.record-form__recent-empty {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--color-brand-800);
  opacity: 0.75;
}

.record-form__recent-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.record-form__recent-item {
  display: grid;
  gap: 0.375rem;
  align-items: baseline;
  grid-template-columns: auto auto 1fr;
  font-size: 0.75rem;
  animation: nb-recent-in var(--duration-base) var(--ease-out-soft);
}

.record-form__recent-check {
  color: var(--nb-income);
}

.record-form__recent-amount {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.record-form__recent-label {
  overflow: hidden;
  color: var(--nb-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes nb-recent-in {
  from {
    opacity: 0;
    transform: translateX(-0.375rem);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
