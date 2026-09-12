/**
 * 统计域：首页 summary、完整 analytics、往来未结清、数据质量。
 *
 * 缓存策略（手册要求）：
 *  - 完整 `/analytics` 每次实时计算，仅在本页面会话内按筛选条件缓存；
 *  - 任何流水/字典写操作后必须调用 invalidate()，否则会展示过期统计。
 *
 * 并发控制**由本 store 统一负责**，调用方不需要传 AbortSignal。四类资源各有
 * 自己的 AbortController，发新请求前先取消旧请求。但**只取消是不够的**：
 * 旧请求可能已经返回、正排队等待写入，此时 abort 已经无效。因此每类资源
 * 另有递增序号，只有最新那次请求的结果才允许写入状态 —— 这样"快速切换筛选
 * 后被旧响应覆盖成旧条件的数据"就不可能发生。这不是性能优化，是正确性。
 *
 * 错误状态按资源分开维护：首页同时加载 summary 与 full，共用一个 error 会让
 * 其中一个失败时、另一个成功的区域显示不相关的错误，后发请求也会清掉先前的错误。
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

import { analyticsApi, type DateRangeParams } from '@/api'
import type {
  DataQualityResponse,
  FullAnalytics,
  OutstandingResponse,
  OutstandingStatus,
  SummaryResponse,
} from '@/types/analytics'
import { ApiError } from '@/types/api'

function rangeKey(range: DateRangeParams): string {
  return `${range.dateFrom ?? ''}..${range.dateTo ?? ''}`
}

/** 四类可独立并发控制的资源。 */
type ResourceKey = 'summary' | 'full' | 'outstanding' | 'dataQuality'

export const useAnalyticsStore = defineStore('analytics', () => {
  const summary = ref<SummaryResponse | null>(null)
  const summaryLoading = ref(false)
  const summaryError = ref<string | null>(null)

  const full = ref<FullAnalytics | null>(null)
  const fullLoading = ref(false)
  const fullError = ref<string | null>(null)

  const outstanding = ref<OutstandingResponse | null>(null)
  const outstandingLoading = ref(false)
  const outstandingError = ref<string | null>(null)

  const dataQuality = ref<DataQualityResponse | null>(null)
  const dataQualityLoading = ref(false)
  const dataQualityError = ref<string | null>(null)

  // 完整分析按筛选条件缓存，避免同一次进入反复请求。
  const fullCache = new Map<string, FullAnalytics>()

  const controllers: Record<ResourceKey, AbortController | null> = {
    summary: null,
    full: null,
    outstanding: null,
    dataQuality: null,
  }
  const sequences: Record<ResourceKey, number> = {
    summary: 0,
    full: 0,
    outstanding: 0,
    dataQuality: 0,
  }

  /**
   * 开始一次新请求：取消同类资源的旧请求，并领一个递增序号。
   * 返回的 `isCurrent()` 用于判断结果是否仍是最新一次请求的。
   */
  function begin(resource: ResourceKey): { signal: AbortSignal; isCurrent: () => boolean } {
    controllers[resource]?.abort()
    const controller = new AbortController()
    controllers[resource] = controller
    const seq = ++sequences[resource]
    return { signal: controller.signal, isCurrent: () => seq === sequences[resource] }
  }

  /** 取消失败属于用户主动切换，不是错误，返回 null。 */
  function errorText(e: unknown): string | null {
    if (e instanceof ApiError && e.isCanceled) return null
    return e instanceof Error ? e.message : '加载统计失败'
  }

  async function loadSummary(range: DateRangeParams = {}): Promise<void> {
    const { signal, isCurrent } = begin('summary')
    summaryLoading.value = true
    summaryError.value = null
    try {
      const result = await analyticsApi.fetchSummary(range, signal)
      if (!isCurrent()) return
      summary.value = result
    } catch (e) {
      if (!isCurrent()) return
      summaryError.value = errorText(e)
    } finally {
      // 只有最新一次请求才有资格结束 loading，否则会把后发请求的 loading 提前关掉
      if (isCurrent()) summaryLoading.value = false
    }
  }

  /** `force` 为 true 时跳过缓存，用于写入流水后主动刷新。 */
  async function loadFull(
    range: DateRangeParams = {},
    options: { force?: boolean } = {},
  ): Promise<void> {
    // 必须在查缓存**之前**领取序号：命中缓存时同样要作废在途请求，
    // 否则先前那个请求返回后会把刚显示的缓存值覆盖掉。
    const { signal, isCurrent } = begin('full')

    if (!options.force) {
      const cached = fullCache.get(rangeKey(range))
      if (cached) {
        full.value = cached
        fullError.value = null
        fullLoading.value = false
        return
      }
    }

    fullLoading.value = true
    fullError.value = null
    try {
      const result = await analyticsApi.fetchFullAnalytics(range, signal)
      if (!isCurrent()) return
      fullCache.set(rangeKey(range), result)
      full.value = result
    } catch (e) {
      if (!isCurrent()) return
      fullError.value = errorText(e)
    } finally {
      if (isCurrent()) fullLoading.value = false
    }
  }

  async function loadOutstanding(
    params: { asOf?: string; status?: OutstandingStatus; relatedParty?: string } = {},
  ): Promise<void> {
    const { signal, isCurrent } = begin('outstanding')
    outstandingLoading.value = true
    outstandingError.value = null
    try {
      const result = await analyticsApi.fetchExternalOutstanding(params, signal)
      if (!isCurrent()) return
      outstanding.value = result
    } catch (e) {
      if (!isCurrent()) return
      outstandingError.value = errorText(e)
    } finally {
      if (isCurrent()) outstandingLoading.value = false
    }
  }

  async function loadDataQuality(): Promise<void> {
    const { signal, isCurrent } = begin('dataQuality')
    dataQualityLoading.value = true
    dataQualityError.value = null
    try {
      const result = await analyticsApi.fetchDataQuality(signal)
      if (!isCurrent()) return
      dataQuality.value = result
    } catch (e) {
      if (!isCurrent()) return
      dataQualityError.value = errorText(e)
    } finally {
      if (isCurrent()) dataQualityLoading.value = false
    }
  }

  /** 写流水、改字典后调用：丢弃所有派生统计，强制下次重新计算。 */
  function invalidate(): void {
    // 在途请求也要作废：它们是按写入前的数据算出来的，回来就是过期统计。
    for (const key of Object.keys(controllers) as ResourceKey[]) {
      controllers[key]?.abort()
      controllers[key] = null
      sequences[key] += 1
    }
    fullCache.clear()
    full.value = null
    summary.value = null
    outstanding.value = null
    // 数据质量的输入是原始流水，也需要重新检查。
    dataQuality.value = null
  }

  function reset(): void {
    invalidate()
    summaryError.value = null
    fullError.value = null
    outstandingError.value = null
    dataQualityError.value = null
  }

  return {
    summary,
    summaryLoading,
    summaryError,
    full,
    fullLoading,
    fullError,
    outstanding,
    outstandingLoading,
    outstandingError,
    dataQuality,
    dataQualityLoading,
    dataQualityError,
    loadSummary,
    loadFull,
    loadOutstanding,
    loadDataQuality,
    invalidate,
    reset,
  }
})
