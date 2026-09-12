import { http } from './http'

import type { MessageResult } from '@/types/api'
import type { LoginResponse, SystemStatus } from '@/types/models'

/** `POST /auth/login` —— 唯一不需要 token 的接口。 */
export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await http.post<LoginResponse>('/auth/login', { username, password })
  return data
}

/**
 * `POST /auth/logout` —— 保存数据并结束内存会话。
 * 调用方应保证无论成功与否都清理本地会话。
 */
export async function logout(): Promise<MessageResult> {
  const { data } = await http.post<MessageResult>('/auth/logout')
  return data
}

/** `GET /status` —— 登录后的应用初始化。 */
export async function fetchStatus(): Promise<SystemStatus> {
  const { data } = await http.get<SystemStatus>('/status')
  return data
}

/** `POST /save` —— 主动持久化，用于"立即保存"或退出前兜底。 */
export async function saveNow(): Promise<MessageResult & { lastEditTime?: string }> {
  const { data } = await http.post<MessageResult & { lastEditTime?: string }>('/save')
  return data
}
