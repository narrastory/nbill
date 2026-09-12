/**
 * 历史记录纠错流程。
 *
 * 后端编辑窗口由 `/status` 的 `editWindowDays` 决定（当前 45 天），
 * 实测数据最早到 2021 年，因此**绝大多数字录都在窗口外**，这不是边缘流程。
 *
 * 约定（手册 BUSINESS_RULES §3 与 FRONTEND_GUIDE「历史记录编辑」）：
 *  1. 第一次 PUT **绝不能**带确认参数，否则会跳过用户确认步骤；
 *  2. 收到 403 后弹窗说明"将先创建备份"，由用户主动确认；
 *  3. 确认后仅重试**一次**，参数精确为小写 `confirmHistoricalEdit=true`；
 *  4. 用户取消则保持原数据，不重试。
 */

import { ref } from 'vue'

import { ElMessage, ElMessageBox } from 'element-plus'

import { useSystemStore } from '@/stores/system'
import { ApiError } from '@/types/api'
import { formatDateDisplay } from '@/utils/date'

export interface HistoricalEditOptions {
  /** 记录原始日期，用于在提示中说明是哪一条。 */
  recordDate?: string
}

export interface HistoricalEditOutcome<T> {
  result: T
  /**
   * true 表示这次修改走了二次确认，后端已先创建备份。
   * 调用方应据此调整成功提示（例如提示"已创建备份"）。
   */
  historical: boolean
}

export function useHistoricalEdit() {
  const system = useSystemStore()
  /** 请求进行中，供调用方禁用按钮防重复提交。 */
  const busy = ref(false)

  /**
   * 判断某个账单日期是否已超出编辑窗口。
   * 仅用于 UI 预判（例如预先禁用删除按钮），**最终以服务端响应为准**。
   */
  function isOutsideWindow(billDate: string): boolean {
    const target = new Date(`${billDate}T00:00:00`)
    if (Number.isNaN(target.getTime())) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const diffDays = Math.floor((today.getTime() - target.getTime()) / 86_400_000)
    return diffDays > system.editWindowDays
  }

  async function confirmHistoricalEdit(options: HistoricalEditOptions): Promise<boolean> {
    const dateText = options.recordDate ? `${formatDateDisplay(options.recordDate)} 的` : '该'
    const windowText = system.editWindowDays
    try {
      await ElMessageBox.confirm(
        `${dateText}记录已超出 ${windowText} 天编辑窗口。\n` +
          '后端会先保存当前数据并创建完整备份，然后才执行修改。',
        '这是一条历史记录',
        {
          confirmButtonText: '确认纠错',
          cancelButtonText: '取消',
          type: 'warning',
          // 保留换行
          customClass: 'nb-confirm-dialog',
        },
      )
      return true
    } catch {
      return false // 用户取消
    }
  }

  /**
   * 执行写操作，必要时走历史纠错二次确认。
   *
   * @param send 接收 `confirm` 参数，由调用方决定是否附加 `confirmHistoricalEdit=true`
   * @returns 成功时的结果；**用户取消时返回 null**（不是错误，调用方应静默处理）
   */
  async function run<T>(
    send: (confirm: boolean) => Promise<T>,
    options: HistoricalEditOptions = {},
  ): Promise<HistoricalEditOutcome<T> | null> {
    busy.value = true
    try {
      try {
        return { result: await send(false), historical: false }
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 403) throw error

        const confirmed = await confirmHistoricalEdit(options)
        if (!confirmed) return null

        // 只重试一次，不再捕获 403 —— 第二次仍失败就按普通错误抛给调用方。
        return { result: await send(true), historical: true }
      }
    } finally {
      busy.value = false
    }
  }

  /**
   * 删除操作。历史记录**没有确认绕过机制**，因此这里不做二次确认重试，
   * 只在超出窗口时给出明确原因。
   */
  async function remove(
    billDate: string,
    doDelete: () => Promise<void>,
  ): Promise<boolean> {
    if (isOutsideWindow(billDate)) {
      ElMessage.warning(
        `${formatDateDisplay(billDate)} 的记录已超出 ${system.editWindowDays} 天编辑窗口，不能删除。`,
      )
      return false
    }
    busy.value = true
    try {
      await doDelete()
      ElMessage.success('已删除')
      return true
    } catch (error) {
      if (error instanceof ApiError) {
        ElMessage.error(error.message)
        return false
      }
      throw error
    } finally {
      busy.value = false
    }
  }

  return { busy, isOutsideWindow, run, remove }
}
