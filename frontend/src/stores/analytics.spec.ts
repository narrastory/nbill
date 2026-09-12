/**
 * 分析 store 的并发与错误隔离。
 *
 * 重点是**旧响应不得覆盖新响应**。这里刻意让假请求完全无视 AbortSignal，
 * 因为现实里 abort 也救不了"响应已经返回、正排队写入"的情况 ——
 * 真正兜住它的是 store 里的递增序号。
 */

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api', () => ({
  analyticsApi: {
    fetchSummary: vi.fn(),
    fetchFullAnalytics: vi.fn(),
    fetchExternalOutstanding: vi.fn(),
    fetchDataQuality: vi.fn(),
  },
}))

import { analyticsApi } from '@/api'

import { useAnalyticsStore } from './analytics'

/** 手工控制结算时机的 promise。 */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** 只要能被 store 原样写入即可，字段内容与本文件无关。 */
function marker(tag: string): never {
  return { tag } as never
}

const summaryMock = () => vi.mocked(analyticsApi.fetchSummary)
const fullMock = () => vi.mocked(analyticsApi.fetchFullAnalytics)

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('并发：后发请求胜出', () => {
  it('慢的旧响应返回时不覆盖已写入的新响应', async () => {
    const slow = deferred<never>()
    summaryMock()
      .mockReturnValueOnce(slow.promise) // A：先发，慢
      .mockResolvedValueOnce(marker('B')) // B：后发，快

    const store = useAnalyticsStore()
    const pendingA = store.loadSummary({})
    const pendingB = store.loadSummary({ dateFrom: '2026-01-01' })

    await pendingB
    expect(store.summary).toMatchObject({ tag: 'B' })

    // A 现在才返回 —— 必须被丢弃
    slow.resolve(marker('A'))
    await pendingA
    expect(store.summary).toMatchObject({ tag: 'B' })
  })

  it('旧请求结束时不提前关掉新请求的 loading', async () => {
    const slowA = deferred<never>()
    const slowB = deferred<never>()
    summaryMock().mockReturnValueOnce(slowA.promise).mockReturnValueOnce(slowB.promise)

    const store = useAnalyticsStore()
    const pendingA = store.loadSummary({})
    const pendingB = store.loadSummary({ dateFrom: '2026-01-01' })
    expect(store.summaryLoading).toBe(true)

    // A 先返回，但 B 还在飞 —— loading 必须保持 true（旧实现在这里会误关）
    slowA.resolve(marker('A'))
    await pendingA
    expect(store.summaryLoading).toBe(true)
    expect(store.summary).toBeNull()

    slowB.resolve(marker('B'))
    await pendingB
    expect(store.summaryLoading).toBe(false)
    expect(store.summary).toMatchObject({ tag: 'B' })
  })

  it('命中缓存同样作废在途请求，缓存值不被旧响应覆盖', async () => {
    const slow = deferred<never>()
    fullMock()
      .mockResolvedValueOnce(marker('cached')) // 先填充缓存
      .mockReturnValueOnce(slow.promise) // 另一个区间的慢请求

    const store = useAnalyticsStore()
    await store.loadFull({ dateFrom: '2026-01-01' })

    // 切到新区间：发起慢请求
    const pendingSlow = store.loadFull({ dateFrom: '2026-02-01' })
    // 再切回已缓存区间：应立即显示缓存值
    await store.loadFull({ dateFrom: '2026-01-01' })
    expect(store.full).toMatchObject({ tag: 'cached' })
    expect(store.fullLoading).toBe(false)

    // 慢请求现在才回来 —— 不得覆盖缓存值
    slow.resolve(marker('slow'))
    await pendingSlow
    expect(store.full).toMatchObject({ tag: 'cached' })
  })

  it('invalidate 后，在途请求返回也不写入（数据已被写操作改过）', async () => {
    const slow = deferred<never>()
    fullMock().mockReturnValueOnce(slow.promise)

    const store = useAnalyticsStore()
    const pending = store.loadFull({})
    store.invalidate()

    slow.resolve(marker('stale'))
    await pending
    expect(store.full).toBeNull()
  })
})

describe('错误按资源隔离', () => {
  it('summary 失败不影响 full 的状态', async () => {
    summaryMock().mockRejectedValueOnce(new Error('summary 挂了'))
    fullMock().mockResolvedValueOnce(marker('ok'))

    const store = useAnalyticsStore()
    await store.loadSummary()
    await store.loadFull()

    expect(store.summaryError).toBe('summary 挂了')
    expect(store.full).toMatchObject({ tag: 'ok' })
    expect(store.fullError).toBeNull()
  })

  it('成功加载会清掉本资源的旧错误，但不动别的资源', async () => {
    summaryMock().mockRejectedValueOnce(new Error('第一次失败'))
    fullMock().mockRejectedValueOnce(new Error('full 失败'))

    const store = useAnalyticsStore()
    await store.loadSummary()
    await store.loadFull()
    expect(store.summaryError).toBe('第一次失败')
    expect(store.fullError).toBe('full 失败')

    summaryMock().mockResolvedValueOnce(marker('恢复'))
    await store.loadSummary()

    expect(store.summaryError).toBeNull()
    expect(store.fullError).toBe('full 失败')
  })
})
