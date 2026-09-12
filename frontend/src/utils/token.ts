/**
 * Token 存取。
 *
 * 手册允许放在内存或 sessionStorage；这里选 sessionStorage：
 *   - 关闭标签页即失效，比 localStorage 更保守；
 *   - 刷新页面仍保持登录，避免开发时反复登录。
 * 绝不在此保存用户名或密码。
 */

const TOKEN_KEY = 'nbill_token'

/** 内存副本，避免每次请求都读一次 storage。 */
let cached: string | null = null
let loaded = false

export function getToken(): string | null {
  if (!loaded) {
    cached = sessionStorage.getItem(TOKEN_KEY)
    loaded = true
  }
  return cached
}

export function setToken(token: string): void {
  cached = token
  loaded = true
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  cached = null
  loaded = true
  sessionStorage.removeItem(TOKEN_KEY)
}
