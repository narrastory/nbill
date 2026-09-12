<script setup lang="ts">
/**
 * 字典分组（分类 / 标签 / 往来类型 / 往来方共用）。
 *
 * 四组字典的结构与交互完全一致，只是字段不同，因此用字段描述表驱动，
 * 避免写四份几乎相同的表格与弹窗。
 *
 * 硬性约束（手册：字典没有删除接口）：
 *  - **绝不提供删除按钮**；
 *  - 重命名会**级联更新引用它的流水**，因此必须二次确认并说明影响面；
 *  - 提交期间禁用该行操作，防止重复提交；
 *  - 冲突返回 409 时保留用户输入，让用户改名后重试，不自动重试。
 */
import { computed, reactive, ref, watch } from 'vue'

import { useMediaQuery } from '@vueuse/core'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'

export interface DictionaryField {
  key: string
  label: string
  type: 'text' | 'select'
  /** select 的候选项 */
  options?: Array<{ label: string; value: string }>
  required?: boolean
  placeholder?: string
  /** 重命名时该字段不可改（例如分类的 Type 不会因为改名而变） */
  readOnlyOnRename?: boolean
  disabled?: boolean
}

export interface DictionaryColumn {
  key: string
  label: string
  width?: number
  minWidth?: number
  /**
   * 窄屏隐藏。
   * 字典表的列较多，窄屏下全部挤在一起会把主要列压到只剩一个字，
   * 因此把"说明"这类补充信息在窄屏隐藏，优先保证分类名可读。
   */
  hideOnNarrow?: boolean
}

const props = withDefaults(
  defineProps<{
    title: string
    description?: string
    /** 表格展示用的行数据，需带一个唯一标识字段 `key` */
    rows: Array<Record<string, unknown> & { key: string }>
    columns: DictionaryColumn[]
    /** 新增时的字段 */
    createFields: DictionaryField[]
    /** 重命名时提交的字段（通常是"新名称"等） */
    renameFields: DictionaryField[]
    loading?: boolean
    /** 正在提交的项标识，用于禁用按钮 */
    submittingKey?: string | null
    emptyText?: string
  }>(),
  {
    description: '',
    loading: false,
    submittingKey: null,
    emptyText: '暂无数据',
  },
)

const emit = defineEmits<{
  create: [payload: Record<string, string>]
  rename: [target: Record<string, unknown> & { key: string }, payload: Record<string, string>]
}>()

const dialogOpen = ref(false)
const dialogMode = ref<'create' | 'rename'>('create')
const dialogTitle = computed(() => (dialogMode.value === 'create' ? `新增${props.title}` : `重命名${props.title}`))
const dialogSubmitting = ref(false)
const formRef = ref<FormInstance>()
const editingRow = ref<(Record<string, unknown> & { key: string }) | null>(null)

const form = reactive<Record<string, string>>({})

const activeFields = computed(() =>
  dialogMode.value === 'create' ? props.createFields : props.renameFields,
)

const rules = computed<FormRules>(() => {
  const result: FormRules = {}
  for (const field of activeFields.value) {
    if (field.required) {
      result[field.key] = [
        { required: true, message: `请填写${field.label}`, trigger: field.type === 'select' ? 'change' : 'blur' },
      ]
    }
  }
  return result
})

function resetForm(): void {
  for (const key of Object.keys(form)) delete form[key]
  for (const field of activeFields.value) {
    // 重命名时把原值带进去，用户只改要改的那部分
    const source = dialogMode.value === 'rename' ? editingRow.value : null
    const preset = source?.[field.key]
    form[field.key] = preset === undefined || preset === null ? '' : String(preset)
  }
}

watch([dialogOpen, dialogMode, editingRow], () => {
  if (dialogOpen.value) resetForm()
})

function openCreate(): void {
  dialogMode.value = 'create'
  editingRow.value = null
  dialogOpen.value = true
}

function openRename(row: Record<string, unknown> & { key: string }): void {
  dialogMode.value = 'rename'
  editingRow.value = row
  dialogOpen.value = true
}

function submit(): void {
  void (async () => {
    if (dialogSubmitting.value) return
    const valid = await formRef.value?.validate().catch(() => false)
    if (!valid) return

    dialogSubmitting.value = true
    try {
      const payload: Record<string, string> = {}
      for (const field of activeFields.value) {
        if (field.type === 'select' && form[field.key] === undefined) continue
        payload[field.key] = form[field.key] ?? ''
      }

      if (dialogMode.value === 'create') {
        emit('create', payload)
      } else if (editingRow.value) {
        // 重命名会影响所有引用它的历史流水，这里明确告知影响面
        try {
          await ElMessageBox.confirm(
            `${props.title}重命名会同时更新所有引用它的历史流水，且无法撤销。\n请确认新的名称无误后再继续。`,
            '重命名会级联更新',
            {
              confirmButtonText: '确认重命名',
              cancelButtonText: '取消',
              type: 'warning',
              customClass: 'nb-confirm-dialog',
            },
          )
        } catch {
          return // 用户取消
        }
        emit('rename', editingRow.value, payload)
      }
    } finally {
      dialogSubmitting.value = false
    }
  })()
}

/** 由父组件在成功后调用，关闭弹窗。失败时保持打开以便用户修改。 */
function closeOnSuccess(): void {
  dialogOpen.value = false
}

/** 由父组件在冲突（409）时调用，保留输入并提示。 */
function reportConflict(message: string): void {
  ElMessage.warning(message)
}

defineExpose({ closeOnSuccess, reportConflict })

const hasRows = computed(() => props.rows.length > 0)

const isNarrow = useMediaQuery('(max-width: 639px)')

/** 窄屏下丢掉补充列，保证主要列有足够宽度。 */
const visibleColumns = computed(() =>
  props.columns.filter((column) => !(column.hideOnNarrow && isNarrow.value)),
)
</script>

<template>
  <section class="dict">
    <header class="dict__head">
      <div>
        <h3 class="dict__title">{{ title }}</h3>
        <p v-if="description" class="dict__desc">{{ description }}</p>
      </div>
      <el-button type="primary" :disabled="loading" @click="openCreate">新增</el-button>
    </header>

    <el-empty v-if="!hasRows && !loading" :description="emptyText" :image-size="70" />

    <el-table v-else v-loading="loading" :data="rows" size="small" stripe>
      <el-table-column
        v-for="column in visibleColumns"
        :key="column.key"
        :prop="column.key"
        :label="column.label"
        :width="column.width"
        :min-width="column.minWidth"
        show-overflow-tooltip
      />

      <el-table-column label="操作" width="96" fixed="right">
        <template #default="{ row }">
          <!-- 字典没有删除接口，因此这里只有重命名，没有删除 -->
          <el-button
            link
            type="primary"
            :disabled="submittingKey === row.key"
            @click="openRename(row)"
          >
            重命名
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <p class="dict__note">字典只支持新增与重命名，不支持删除。</p>

    <el-dialog v-model="dialogOpen" :title="dialogTitle" :width="460" :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item
          v-for="field in activeFields"
          :key="field.key"
          :label="field.label"
          :prop="field.key"
        >
          <el-select
            v-if="field.type === 'select'"
            v-model="form[field.key]"
            :placeholder="field.placeholder ?? `请选择${field.label}`"
            :disabled="field.disabled"
            class="dict__control"
          >
            <el-option
              v-for="option in field.options ?? []"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>

          <el-input
            v-else
            v-model="form[field.key]"
            :placeholder="field.placeholder ?? `请输入${field.label}`"
            :disabled="field.disabled"
            maxlength="40"
            show-word-limit
          />
          <p v-if="field.readOnlyOnRename && dialogMode === 'rename'" class="dict__field-hint">
            重命名时该项不可修改
          </p>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button :disabled="dialogSubmitting" @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="dialogSubmitting" @click="submit">确定</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<style scoped>
.dict {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.dict__head {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-start;
  justify-content: space-between;
}

.dict__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
}

.dict__desc {
  margin: 0.125rem 0 0;
  font-size: 0.75rem;
  line-height: 1.6;
  color: var(--nb-text-muted);
}

.dict__note {
  margin: 0;
  font-size: 0.75rem;
  color: var(--nb-text-subtle);
}

.dict__control {
  width: 100%;
}

.dict__field-hint {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: var(--nb-text-subtle);
}
</style>
