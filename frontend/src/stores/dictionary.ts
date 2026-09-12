/**
 * 字典域：分类、标签、往来类型、往来方。
 *
 * 分类/子分类/标签/往来类型/往来方必须来自后端字典（手册硬性规则之一），
 * 因此表单选项一律从本 store 取，不允许前端写死。
 *
 * 写操作成功后需失效的资源见 invalidateAfterRename，
 * 由页面在重命名成功后调用。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { dictionariesApi } from '@/api'
import { useSystemStore } from './system'
import type {
  BillCategory,
  BillTag,
  ExFlowType,
  ExRelatedParty,
  GroupedCategories,
  TransactionType,
} from '@/types/models'

const EMPTY_GROUPED: GroupedCategories = { Income: {}, Expense: {} }

export const useDictionaryStore = defineStore('dictionary', () => {
  const categories = ref<BillCategory[]>([])
  const grouped = ref<GroupedCategories>({ ...EMPTY_GROUPED })
  const tags = ref<BillTag[]>([])
  const flowTypes = ref<ExFlowType[]>([])
  const relatedParties = ref<ExRelatedParty[]>([])

  const loading = ref(false)
  const error = ref<string | null>(null)
  /** 四组字典是否都已就绪，用于表单禁用。 */
  const ready = ref(false)

  /* ------------------------------ 派生数据 ------------------------------ */

  /** 指定收支类型下的一级分类名（有序、去重）。 */
  function categoryNames(type: TransactionType): string[] {
    return Object.keys(grouped.value[type] ?? {})
  }

  /** 指定收支类型 + 一级分类下的二级分类。 */
  function subcategories(type: TransactionType, category: string): string[] {
    return (grouped.value[type]?.[category] ?? []).map((item) => item.subcategory)
  }

  /**
   * 可用于当前收支类型的标签。
   * 后端不会按 AppliesTo 拦截，前端必须自己过滤，否则会引导用户选到
   * 语义上不该出现的标签。
   */
  const tagsForType = computed(() => (type: TransactionType) =>
    tags.value.filter((tag) => tag.AppliesTo === type || tag.AppliesTo === 'Both'),
  )

  const flowTypeNames = computed(() => flowTypes.value.map((item) => item.Flowtype))
  const relatedPartyNames = computed(() => relatedParties.value.map((item) => item.Relatedparty))

  /* ------------------------------ 加载逻辑 ------------------------------ */

  /** 四组字典并行加载（手册推荐的启动流程第 4 步）。 */
  async function loadAll(signal?: AbortSignal): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const [categoryResult, tagResult, flowTypeResult, partyResult] = await Promise.all([
        dictionariesApi.listBillCategories(undefined, signal),
        dictionariesApi.listBillTags(undefined, signal),
        dictionariesApi.listExFlowTypes(signal),
        dictionariesApi.listExRelatedParties(signal),
      ])
      categories.value = categoryResult.data
      grouped.value = categoryResult.grouped
      tags.value = tagResult
      flowTypes.value = flowTypeResult
      relatedParties.value = partyResult
      ready.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载字典失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  async function refreshCategories(signal?: AbortSignal): Promise<void> {
    const result = await dictionariesApi.listBillCategories(undefined, signal)
    categories.value = result.data
    grouped.value = result.grouped
  }

  async function refreshTags(signal?: AbortSignal): Promise<void> {
    tags.value = await dictionariesApi.listBillTags(undefined, signal)
  }

  async function refreshFlowTypes(signal?: AbortSignal): Promise<void> {
    flowTypes.value = await dictionariesApi.listExFlowTypes(signal)
  }

  async function refreshRelatedParties(signal?: AbortSignal): Promise<void> {
    relatedParties.value = await dictionariesApi.listExRelatedParties(signal)
  }

  /**
   * 重命名/新增成功后：刷新对应字典。
   * 调用方还须同时失效流水列表与分析缓存 —— 后端会级联更新已有流水。
   */
  async function refreshAfterDictionaryWrite(
    scope: 'billCategory' | 'billTag' | 'exFlowType' | 'exRelatedParty',
  ): Promise<void> {
    switch (scope) {
      case 'billCategory':
        await refreshCategories()
        break
      case 'billTag':
        await refreshTags()
        break
      case 'exFlowType':
        await refreshFlowTypes()
        break
      case 'exRelatedParty':
        await refreshRelatedParties()
        break
    }
  }

  /** 写字典后记录数可能变化，同步一下 status counts。 */
  async function syncCounts(): Promise<void> {
    await useSystemStore().fetchStatus()
  }

  function reset(): void {
    categories.value = []
    grouped.value = { ...EMPTY_GROUPED }
    tags.value = []
    flowTypes.value = []
    relatedParties.value = []
    ready.value = false
  }

  return {
    categories,
    grouped,
    tags,
    flowTypes,
    relatedParties,
    loading,
    error,
    ready,
    categoryNames,
    subcategories,
    tagsForType,
    flowTypeNames,
    relatedPartyNames,
    loadAll,
    refreshCategories,
    refreshTags,
    refreshFlowTypes,
    refreshRelatedParties,
    refreshAfterDictionaryWrite,
    syncCounts,
    reset,
  }
})
