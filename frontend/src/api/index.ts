/** API 层统一出口，组件只从这里 import。 */

export * as analyticsApi from './analytics'
export * as authApi from './auth'
export * as dictionariesApi from './dictionaries'
export * as externalTransactionsApi from './externalTransactions'
export * as transactionsApi from './transactions'

export { http, setUnauthorizedHandler } from './http'
export { ApiError } from '@/types/api'

export type { DateRangeParams } from './analytics'
export type { BillCategoriesResponse } from './dictionaries'
