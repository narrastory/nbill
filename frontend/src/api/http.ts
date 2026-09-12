/**
 * 统一的 Axios 实例。
 *
 * 约定（对应手册 FRONTEND_GUIDE「API 客户端原则」与「HTTP 状态处理表」）：
 *  - baseURL 来自 VITE_API_BASE_URL，不在组件里拼路径；
 *  - 自动附加 `Authorization: Bearer <token>`；
 *  - 所有失败都归一化成 ApiError，组件不直接接触 Axios 错误结构；
 *  - 401 交给注册的处理器（清 token + 跳登录），本文件不 import store，避免循环依赖；
 *  - AbortError 是用户主动取消，标记 isCanceled 且不弹提示；
 *  - 绝不自动重试：403 的历史编辑确认必须由用户显式触发。
 */

import axios, { AxiosError, type AxiosInstance } from 'axios'

import { ApiError, type ApiErrorPayload } from '@/types/api'
import { clearToken, getToken } from '@/utils/token'

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

/** 由 bootstrap 层注入，避免 http ↔ store ↔ router 的循环依赖。 */
type UnauthorizedHandler = () => void
let onUnauthorized: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler
}

/**
 * 会话失效时的统一处理。多个并发请求同时 401 时只触发一次副作用。
 */
let handlingUnauthorized = false
function handleUnauthorized(): void {
  if (handlingUnauthorized) return
  handlingUnauthorized = true
  clearToken()
  onUnauthorized?.()
  // 下一个微任务再解锁，避免同一批并发请求重复跳转。
  queueMicrotask(() => {
    handlingUnauthorized = false
  })
}

export const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 20_000,
  headers: { Accept: 'application/json' },
})

http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

http.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    throw normalizeError(error)
  },
)

function normalizeError(error: unknown): ApiError {
  // 用户切换筛选/离开页面造成的取消：静默处理。
  if (axios.isCancel(error)) {
    return new ApiError(0, '请求已取消', undefined, true)
  }

  if (error instanceof AxiosError) {
    if (error.code === 'ERR_CANCELED') {
      return new ApiError(0, '请求已取消', undefined, true)
    }

    const status = error.response?.status ?? 0
    const payload = error.response?.data

    // 网络层失败：没有 response。
    if (!error.response) {
      const message =
        error.code === 'ECONNABORTED' ? '请求超时，请稍后重试' : '无法连接到服务器，请确认后端已启动'
      return new ApiError(status, message, undefined)
    }

    if (status === 401) {
      handleUnauthorized()
    }

    return new ApiError(status, extractMessage(payload, status), payload)
  }

  return new ApiError(0, error instanceof Error ? error.message : '未知错误')
}

/**
 * 优先使用后端 `{ error }` 文案，其次给出按状态码的兜底文案。
 */
function extractMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const { error } = payload as ApiErrorPayload
    if (typeof error === 'string' && error.trim() !== '') return error
  }
  switch (status) {
    case 400:
      return '请求参数有误，请检查后重试'
    case 403:
      return '该记录已超出可编辑窗口'
    case 404:
      return '记录不存在或已被删除'
    case 409:
      return '与已有数据冲突，请修改后重试'
    case 500:
      return '服务器内部错误，请稍后重试'
    default:
      return `请求失败（${status}）`
  }
}

/** 成功响应统一取 `{ data }` 外壳，减少各 API 模块的重复解包。 */
export async function getData<T>(url: string, params?: unknown, signal?: AbortSignal): Promise<T> {
  const { data } = await http.get<{ data: T }>(url, { params, signal })
  return data.data
}

export async function getRaw<T>(url: string, params?: unknown, signal?: AbortSignal): Promise<T> {
  const { data } = await http.get<T>(url, { params, signal })
  return data
}
