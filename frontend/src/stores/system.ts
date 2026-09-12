/**
 * 系统状态：初始余额、编辑窗口、记录数、最近保存时间。
 *
 * `editWindowDays` 是判断"历史记录"的权威依据，历史编辑二次确认
 * 与删除按钮的预禁用都应读它，而不是在前端硬编码 45。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { authApi } from '@/api'
import type { RecordCounts } from '@/types/models'

const EMPTY_COUNTS: RecordCounts = {
  transactions: 0,
  externalTransactions: 0,
  billCategories: 0,
  billTags: 0,
  exFlowType: 0,
  exRelatedParty: 0,
}

/**
 * /status 尚未返回时的占位值，仅用于避免首屏出现无意义的 0。
 * 一旦 fetchStatus() 成功，立即被后端真实值覆盖；所有业务判断必须读
 * editWindowDays.value，不得在别处再写这个数字。
 */
const FALLBACK_EDIT_WINDOW_DAYS = 45

export const useSystemStore = defineStore('system', () => {
  const initialBalance = ref(0)
  const editWindowDays = ref(FALLBACK_EDIT_WINDOW_DAYS)
  const lastEditTime = ref<string | null>(null)
  const counts = ref<RecordCounts>({ ...EMPTY_COUNTS })
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** 判断某个账单日期是否已超出编辑窗口。UI 预判用，最终以服务端 403 为准。 */
  const isOutsideEditWindow = computed(() => (billDate: string, today = new Date()) => {
    const target = new Date(`${billDate}T00:00:00`)
    if (Number.isNaN(target.getTime())) return false
    const diffDays = Math.floor((today.getTime() - target.getTime()) / 86_400_000)
    return diffDays > editWindowDays.value
  })

  async function fetchStatus(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const status = await authApi.fetchStatus()
      initialBalance.value = status.initialBalance
      editWindowDays.value = status.editWindowDays
      lastEditTime.value = status.lastEditTime
      counts.value = status.counts
    } catch (e) {
      error.value = e instanceof Error ? e.message : '加载系统状态失败'
      throw e
    } finally {
      loading.value = false
    }
  }

  /** 主动持久化；写接口本身会自动保存，这里用于"立即保存"或退出前兜底。 */
  async function saveNow(): Promise<void> {
    const result = await authApi.saveNow()
    if (result.lastEditTime) lastEditTime.value = result.lastEditTime
  }

  /** 写操作成功后本地更新计数，避免为了几个数字重新拉 /status。 */
  function adjustCount(key: keyof RecordCounts, delta: number): void {
    counts.value = { ...counts.value, [key]: Math.max(0, counts.value[key] + delta) }
  }

  function reset(): void {
    initialBalance.value = 0
    editWindowDays.value = FALLBACK_EDIT_WINDOW_DAYS
    lastEditTime.value = null
    counts.value = { ...EMPTY_COUNTS }
  }

  return {
    initialBalance,
    editWindowDays,
    lastEditTime,
    counts,
    loading,
    error,
    isOutsideEditWindow,
    fetchStatus,
    saveNow,
    adjustCount,
    reset,
  }
})
