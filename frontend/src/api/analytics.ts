/**
 * 分析接口。
 *
 * 分层原则（手册建议）：首页只用轻量的 summary；
 * 完整的 `/analytics` 计算量大，只在进入分析页时按需加载，
 * 绝不在每次路由切换时调用。
 *
 * 日期参数首尾均包含；`dateTo` 省略时默认今天且不允许未来日期。
 * 完整分析是实时计算，写流水后必须使缓存失效。
 */

import { http } from './http'

import type {
  DataQualityResponse,
  FullAnalytics,
  OutstandingResponse,
  OutstandingStatus,
  SummaryResponse,
} from '@/types/analytics'

export interface DateRangeParams {
  dateFrom?: string
  dateTo?: string
}

function rangeParams(range: DateRangeParams = {}): Record<string, string> {
  const params: Record<string, string> = {}
  if (range.dateFrom) params.dateFrom = range.dateFrom
  if (range.dateTo) params.dateTo = range.dateTo
  return params
}

/** `GET /analytics/summary` —— 首页卡片与分类排行。 */
export async function fetchSummary(
  range: DateRangeParams = {},
  signal?: AbortSignal,
): Promise<SummaryResponse> {
  const { data } = await http.get<SummaryResponse>('/analytics/summary', {
    params: rangeParams(range),
    signal,
  })
  return data
}

/** `GET /analytics/external-outstanding` —— 往来款业务组视图。 */
export async function fetchExternalOutstanding(
  params: { asOf?: string; status?: OutstandingStatus; relatedParty?: string } = {},
  signal?: AbortSignal,
): Promise<OutstandingResponse> {
  const query: Record<string, string> = {}
  if (params.asOf) query.asOf = params.asOf
  if (params.status) query.status = params.status
  if (params.relatedParty) query.relatedParty = params.relatedParty

  const { data } = await http.get<OutstandingResponse>('/analytics/external-outstanding', {
    params: query,
    signal,
  })
  return data
}

/**
 * `GET /analytics/data-quality`
 * ⚠️ 发现问题时 HTTP 仍为 200，必须读 `healthy` 判断。
 */
export async function fetchDataQuality(signal?: AbortSignal): Promise<DataQualityResponse> {
  const { data } = await http.get<DataQualityResponse>('/analytics/data-quality', { signal })
  return data
}

/** `GET /analytics` —— 完整分析，实时计算，按需调用。 */
export async function fetchFullAnalytics(
  range: DateRangeParams = {},
  signal?: AbortSignal,
): Promise<FullAnalytics> {
  const { data } = await http.get<FullAnalytics>('/analytics', {
    params: rangeParams(range),
    signal,
  })
  return data
}
