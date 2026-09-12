/** 通用 API 包装类型，对应后端的统一响应结构。 */

/** 列表响应：`{ data, total, page, limit }`。 */
export interface PageResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

/** 详情/写操作响应：`{ data }`。 */
export interface DataResult<T> {
  data: T
}

/** 仅返回提示信息的操作，例如删除、保存。 */
export interface MessageResult {
  message: string
}

/** 历史纠错确认成功时的附加标记。 */
export interface HistoricalEditResult {
  historicalEdit?: boolean
  backupCreated?: boolean
}

/** 后端错误响应体：`{ "error": "..." }`。 */
export interface ApiErrorPayload {
  error: string
}

/**
 * 归一化后的 API 错误。组件只依赖这个类型，不直接读 Axios 的错误结构。
 */
export class ApiError extends Error {
  readonly status: number
  readonly payload: unknown
  /** 是否为"用户切换筛选/离开页面"造成的主动取消，不应弹错误提示。 */
  readonly isCanceled: boolean

  constructor(status: number, message: string, payload?: unknown, isCanceled = false) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
    this.isCanceled = isCanceled
  }
}

/** 分页与排序请求参数。 */
export interface PageQuery {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

/** 普通流水列表筛选条件。 */
export interface TransactionQuery extends PageQuery {
  type?: 'Income' | 'Expense'
  category?: string
  subcategory?: string
  tag?: string
  description?: string
  amountMin?: number
  amountMax?: number
  dateFrom?: string
  dateTo?: string
}

/** 外部往来列表筛选条件。 */
export interface ExternalTransactionQuery extends PageQuery {
  type?: 'IN' | 'OUT'
  flowType?: string
  relatedParty?: string
  description?: string
  amountMin?: number
  amountMax?: number
  dateFrom?: string
  dateTo?: string
}
