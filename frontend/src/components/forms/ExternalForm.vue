<script setup lang="ts">
/**
 * 外部往来表单：新增（含连续添加）与编辑共用。
 *
 * ⚠️ 字段名约定（见 docs/frontend-backend-manual/API_REFERENCE.md）：
 *  - 流水上用的是**驼峰** `FlowType` / `RelatedParty`；
 *  - 字典接口返回的才是**小写** `Flowtype` / `Relatedparty`。
 *  两者不同名，不能合并成一个类型。
 *
 * `RelatedID` 内部维护为 `number[]`，提交前用 serializeIds 去重升序并
 * 以英文逗号连接；详情接口返回的 `relatedTransactions` 不是表字段，绝不提交。
 */
import { computed, nextTick, reactive, ref, watch } from 'vue'

import { ElInput, ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'

import { externalTransactionsApi } from '@/api'
import { useHistoricalEdit } from '@/composables/useHistoricalEdit'
import { useDictionaryStore } from '@/stores/dictionary'
import { useTransactionsStore } from '@/stores/transactions'
import { ApiError } from '@/types/api'
import type { ExternalTransaction, ExternalType } from '@/types/models'
import { localDateString } from '@/utils/date'
import { formatMoney, parseIds, serializeIds } from '@/utils/format'
import { stableFormSnapshot } from '@/utils/formSnapshot'

const props = withDefaults(
  defineProps<{ mode?: 'create' | 'edit'; editing?: ExternalTransaction | null }>(),
  { mode: 'create', editing: null },
)

const emit = defineEmits<{ saved: [record: ExternalTransaction]; close: [] }>()

const dictionary = useDictionaryStore()
const transactions = useTransactionsStore()
const historical = useHistoricalEdit()

const formRef = ref<FormInstance>()
const amountRef = ref<InstanceType<typeof ElInput>>()
const submitting = ref(false)
const refocusAmount = ref(false)

/** 关联候选：从现有外部往来里挑，排除自己。 */
interface Candidate {
  id: number
  label: string
}
const candidates = ref<Candidate[]>([])
const candidatesLoading = ref(false)

const form = reactive({
  Type: 'OUT' as ExternalType,
  FlowDate: localDateString(),
  FlowType: '',
  RelatedParty: '',
  Amount: '',
  Description: '',
  relatedIds: [] as number[],
})

const cleanSnapshot = ref(stableFormSnapshot(form))

function markClean(): void {
  cleanSnapshot.value = stableFormSnapshot(form)
}

function hasUnsavedChanges(): boolean {
  return stableFormSnapshot(form) !== cleanSnapshot.value
}

const isEdit = computed(() => props.mode === 'edit')

function disableFutureDate(date: Date): boolean {
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  return date.getTime() > endOfToday.getTime()
}

/** 方向切换时给出更具体的提示，避免用户把 IN/OUT 理解成收入/支出。 */
const directionHint = computed(() =>
  form.Type === 'OUT'
    ? '钱离开账户：借出、垫付等。不计入消费。'
    : '钱回到账户：归还、收回等。不计入收入。',
)

watch(
  () => props.editing,
  (record) => {
    if (!record) return
    form.Type = record.Type
    form.FlowDate = record.FlowDate
    form.FlowType = record.FlowType
    form.RelatedParty = record.RelatedParty
    form.Amount = String(record.Amount)
    form.Description = record.Description
    form.relatedIds = parseIds(record.RelatedID)
    markClean()
  },
  { immediate: true },
)

/** 载入可关联的其他往来记录。数据量小（实测 44 条），一次取回即可。 */
async function loadCandidates(): Promise<void> {
  candidatesLoading.value = true
  try {
    const page = await externalTransactionsApi.listExternalTransactions({ page: 1, limit: 500 })
    const selfId = props.editing?.ID
    candidates.value = page.data
      .filter((item) => item.ID !== selfId)
      .map((item) => ({
        id: item.ID,
        label: `#${item.ID} · ${item.FlowDate} · ${item.Type === 'OUT' ? '流出' : '流入'} · ${formatMoney(item.Amount)} · ${item.RelatedParty}`,
      }))
  } catch {
    // 候选加载失败不阻塞主流程，用户仍可只填必填字段。
    candidates.value = []
  } finally {
    candidatesLoading.value = false
  }
}

void loadCandidates()

/* -------------------------------- 校验 -------------------------------- */

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

function validateFlowDate(_rule: unknown, value: string, callback: (error?: Error) => void): void {
  if (!value) {
    callback(new Error('请选择日期'))
    return
  }
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  const target = new Date(`${value}T00:00:00`)
  if (!Number.isNaN(target.getTime()) && target.getTime() > endOfToday.getTime()) {
    callback(new Error('日期不能晚于今天'))
    return
  }
  callback()
}

const rules: FormRules = {
  FlowDate: [{ validator: validateFlowDate, trigger: 'change' }],
  FlowType: [{ required: true, message: '请选择往来类型', trigger: 'change' }],
  RelatedParty: [{ required: true, message: '请选择往来方', trigger: 'change' }],
  Amount: [{ validator: validateAmount, trigger: 'blur' }],
  Description: [{ required: true, message: '请填写描述', trigger: 'blur' }],
}

/* -------------------------------- 提交 -------------------------------- */

function buildPayload() {
  return {
    Type: form.Type,
    FlowDate: form.FlowDate,
    FlowType: form.FlowType,
    RelatedParty: form.RelatedParty,
    Amount: Number(form.Amount),
    Description: form.Description.trim(),
    RelatedID: serializeIds(form.relatedIds),
  }
}

/**
 * 关联组涉及多笔记录，改动会影响未偿金额的计算口径，
 * 因此编辑已有关联的记录时要求二次确认。
 */
async function confirmRelatedChange(): Promise<boolean> {
  if (form.relatedIds.length === 0) return true
  try {
    await ElMessageBox.confirm(
      `这条记录将与 ${form.relatedIds.length} 笔记录归为同一个往来组，` +
        '未偿金额会按整组重新计算。确认继续吗？',
      '关联记录',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'info' },
    )
    return true
  } catch {
    return false
  }
}

async function submit(keepOpen: boolean): Promise<void> {
  if (submitting.value) return

  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  if (!isEdit.value) {
    const ok = await confirmRelatedChange()
    if (!ok) return
  }

  submitting.value = true
  try {
    const payload = buildPayload()

    if (isEdit.value && props.editing) {
      const outcome = await historical.run(
        (confirm) => transactions.updateExternalTransaction(props.editing!.ID, payload, confirm),
        { recordDate: props.editing.FlowDate },
      )
      if (outcome === null) return // 用户取消
      ElMessage.success(outcome.historical ? '已修改，并已创建备份' : '已保存修改')
      markClean()
      emit('saved', { ...props.editing, ...payload })
      emit('close')
      return
    }

    const created = await transactions.createExternalTransaction(payload)
    ElMessage.success(`已保存：${formatMoney(created.Amount)} ${created.RelatedParty}`)
    emit('saved', created)

    if (keepOpen) {
      // 连续添加：保留方向/日期/类型/往来方，清空每条都不同的字段。
      form.Amount = ''
      form.Description = ''
      form.relatedIds = []
      markClean()
      formRef.value?.clearValidate(['Amount', 'Description'])
      refocusAmount.value = true
      void loadCandidates()
    } else {
      markClean()
      emit('close')
    }
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '保存失败，请稍后重试')
  } finally {
    submitting.value = false
  }

  // 与普通收支同理：必须等 submitting 复位（输入框解除 disabled）后再聚焦。
  if (refocusAmount.value) {
    refocusAmount.value = false
    await nextTick()
    amountRef.value?.focus()
  }
}

function resetForm(): void {
  form.Type = 'OUT'
  form.FlowDate = localDateString()
  form.FlowType = ''
  form.RelatedParty = ''
  form.Amount = ''
  form.Description = ''
  form.relatedIds = []
  markClean()
  formRef.value?.clearValidate()
  void nextTick(() => amountRef.value?.focus())
}

async function focusAmount(): Promise<void> {
  await nextTick()
  amountRef.value?.focus()
}

defineExpose({ focusAmount, hasUnsavedChanges })
</script>

<template>
  <div class="external-form">
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent>
      <div class="external-form__grid">
        <el-form-item label="方向" prop="Type" class="external-form__span-2">
          <el-radio-group v-model="form.Type" :disabled="submitting">
            <el-radio-button value="OUT">流出（借出/垫付）</el-radio-button>
            <el-radio-button value="IN">流入（归还/收回）</el-radio-button>
          </el-radio-group>
          <p class="external-form__hint">{{ directionHint }}</p>
        </el-form-item>

        <el-form-item label="日期" prop="FlowDate">
          <el-date-picker
            v-model="form.FlowDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            :disabled="isEdit || submitting"
            :disabled-date="disableFutureDate"
            class="external-form__full"
          />
          <p v-if="isEdit" class="external-form__hint">原始日期不可修改</p>
        </el-form-item>

        <el-form-item label="金额" prop="Amount">
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

        <el-form-item label="往来类型" prop="FlowType">
          <el-select
            v-model="form.FlowType"
            placeholder="选择往来类型"
            filterable
            :disabled="submitting"
            class="external-form__full"
          >
            <el-option
              v-for="name in dictionary.flowTypeNames"
              :key="name"
              :label="name"
              :value="name"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="往来方" prop="RelatedParty">
          <el-select
            v-model="form.RelatedParty"
            placeholder="选择往来方"
            filterable
            :disabled="submitting"
            class="external-form__full"
          >
            <el-option
              v-for="name in dictionary.relatedPartyNames"
              :key="name"
              :label="name"
              :value="name"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="描述" prop="Description" class="external-form__span-2">
          <el-input
            v-model="form.Description"
            placeholder="这笔往来是什么"
            maxlength="60"
            show-word-limit
            :disabled="submitting"
          />
        </el-form-item>

        <el-form-item label="关联记录（可选）" class="external-form__span-2">
          <p class="external-form__field-hint">
            关联后，这些流入与流出会作为一个业务组共同计算未偿金额。
          </p>
          <el-select
            v-model="form.relatedIds"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            :loading="candidatesLoading"
            :disabled="submitting"
            placeholder="选择与之同属一个往来组的记录"
            class="external-form__full"
          >
            <el-option
              v-for="item in candidates"
              :key="item.id"
              :label="item.label"
              :value="item.id"
            />
          </el-select>
          <p class="external-form__hint">
            关联后按整组计算未偿金额。留空表示这是一笔独立往来。
          </p>
        </el-form-item>
      </div>

      <div class="external-form__actions">
        <el-button v-if="!isEdit" :disabled="submitting" @click="resetForm">重置表单</el-button>
        <div class="external-form__actions-right">
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
      <p v-if="!isEdit" class="external-form__retention">
        保存并继续会保留方向、日期、往来类型和往来方，并清空金额、描述与关联记录。
      </p>
    </el-form>
  </div>
</template>

<style scoped>
.external-form__grid {
  display: grid;
  gap: 0 1rem;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.external-form__span-2 {
  grid-column: span 2;
}

.external-form__full {
  width: 100%;
}

.external-form__hint {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--nb-text-subtle);
}

.external-form__field-hint,
.external-form__retention {
  width: 100%;
  margin: 0 0 0.375rem;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--nb-text-muted);
}

.external-form__retention {
  margin-top: 0.625rem;
  text-align: right;
}

@media (max-width: 639px) {
  .external-form__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .external-form__span-2 {
    grid-column: span 1;
  }
}

.external-form__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  padding-top: 0.5rem;
  margin-top: 0.75rem;
  border-top: 1px solid var(--nb-border);
}

.external-form__actions-right {
  display: flex;
  gap: 0.5rem;
  margin-left: auto;
}
</style>
