/**
 * 会话与登录状态。
 *
 * 关键约束：
 *  - 只保存 token，绝不保存密码；
 *  - "token 未过期"不等于"会话可用"：后端重启会使已签发 token 失效，
 *    因此真正的可用性以实际接口（/status）的响应为准，401 统一清会话。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { authApi } from '@/api'
import { clearToken, getToken, setToken } from '@/utils/token'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getToken())
  /** 仅在 /status 返回后填充；也用于头部展示当前用户。 */
  const username = ref<string | null>(null)
  /** 标记本次会话是否已通过 /status 校验。 */
  const sessionVerified = ref(false)

  const isAuthenticated = computed(() => token.value !== null)

  /** 登录：成功仅落 token，具体初始化交给 system store。 */
  async function login(name: string, password: string): Promise<void> {
    const result = await authApi.login(name, password)
    setToken(result.token)
    token.value = result.token
    username.value = name
    sessionVerified.value = false
  }

  /**
   * 用 /status 校验会话是否真正可用。
   * 失败说明 token 已失效（例如后端重启），此时清理本地会话。
   */
  async function verifySession(): Promise<boolean> {
    if (!token.value) return false
    try {
      const status = await authApi.fetchStatus()
      username.value = status.username
      sessionVerified.value = true
      return true
    } catch {
      reset()
      return false
    }
  }

  /** 主动退出：无论后端结果如何都清理本地会话。 */
  async function logout(): Promise<void> {
    try {
      await authApi.logout()
    } catch {
      // 后端不可用也要让用户退出，因此吞掉错误。
    } finally {
      reset()
    }
  }

  /** 清理本地会话。供 401 处理器与路由守卫调用。 */
  function reset(): void {
    clearToken()
    token.value = null
    username.value = null
    sessionVerified.value = false
  }

  return { token, username, sessionVerified, isAuthenticated, login, verifySession, logout, reset }
})
