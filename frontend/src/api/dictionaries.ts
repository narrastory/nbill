/**
 * 四组字典接口。
 *
 * 共同点：都没有删除接口，只支持新增和重命名；
 * 重命名会级联更新引用它的流水，成功后必须失效相关缓存
 * （字典、对应列表、分析结果）。
 *
 * 路径参数必须 encodeURIComponent——分类名可能含 `/`、空格、`&`。
 */

import { http } from './http'

import type { DataResult } from '@/types/api'
import type {
  BillCategory,
  BillTag,
  ExFlowType,
  ExRelatedParty,
  GroupedCategories,
  TagAppliesTo,
  TransactionType,
} from '@/types/models'

/* ------------------------------- 分类字典 ------------------------------- */

export interface BillCategoriesResponse {
  data: BillCategory[]
  /** 始终包含全部 Type 的分组，不受 type 参数影响。 */
  grouped: GroupedCategories
}

/** `GET /bill-categories`；`type` 只过滤 `data`，不过滤 `grouped`。 */
export async function listBillCategories(
  type?: TransactionType,
  signal?: AbortSignal,
): Promise<BillCategoriesResponse> {
  const { data } = await http.get<BillCategoriesResponse>('/bill-categories', {
    params: type ? { type } : undefined,
    signal,
  })
  return data
}

export async function createBillCategory(payload: BillCategory): Promise<BillCategory> {
  const { data } = await http.post<DataResult<BillCategory>>('/bill-categories', payload)
  return data.data
}

/** 重命名分类/子分类，会级联更新引用它的普通流水。 */
export async function renameBillCategory(
  category: string,
  subcategory: string,
  payload: { newCategory?: string; newSubcategory?: string; newDescription?: string },
): Promise<BillCategory> {
  const { data } = await http.put<DataResult<BillCategory>>(
    `/bill-categories/${encodeURIComponent(category)}/${encodeURIComponent(subcategory)}`,
    payload,
  )
  return data.data
}

/* -------------------------------- 标签字典 ------------------------------- */

export async function listBillTags(
  appliesTo?: TagAppliesTo,
  signal?: AbortSignal,
): Promise<BillTag[]> {
  const { data } = await http.get<DataResult<BillTag[]>>('/bill-tags', {
    params: appliesTo ? { appliesTo } : undefined,
    signal,
  })
  return data.data
}

export async function createBillTag(payload: {
  Tag: string
  Description?: string
  AppliesTo?: TagAppliesTo
}): Promise<BillTag> {
  const { data } = await http.post<DataResult<BillTag>>('/bill-tags', payload)
  return data.data
}

export async function renameBillTag(
  tag: string,
  payload: { newTag?: string; newDescription?: string; newAppliesTo?: TagAppliesTo },
): Promise<BillTag> {
  const { data } = await http.put<DataResult<BillTag>>(
    `/bill-tags/${encodeURIComponent(tag)}`,
    payload,
  )
  return data.data
}

/* ------------------------------ 往来类型字典 ----------------------------- */

/** 注意字段名是小写 t：`Flowtype`。 */
export async function listExFlowTypes(signal?: AbortSignal): Promise<ExFlowType[]> {
  const { data } = await http.get<DataResult<ExFlowType[]>>('/ex-flow-types', { signal })
  return data.data
}

export async function createExFlowType(flowtype: string): Promise<ExFlowType> {
  const { data } = await http.post<DataResult<ExFlowType>>('/ex-flow-types', { Flowtype: flowtype })
  return data.data
}

export async function renameExFlowType(flowtype: string, newFlowtype: string): Promise<ExFlowType> {
  const { data } = await http.put<DataResult<ExFlowType>>(
    `/ex-flow-types/${encodeURIComponent(flowtype)}`,
    { newFlowtype },
  )
  return data.data
}

/* ------------------------------- 往来方字典 ------------------------------ */

/** 注意字段名是小写 p：`Relatedparty`。 */
export async function listExRelatedParties(signal?: AbortSignal): Promise<ExRelatedParty[]> {
  const { data } = await http.get<DataResult<ExRelatedParty[]>>('/ex-related-parties', { signal })
  return data.data
}

export async function createExRelatedParty(relatedparty: string): Promise<ExRelatedParty> {
  const { data } = await http.post<DataResult<ExRelatedParty>>('/ex-related-parties', {
    Relatedparty: relatedparty,
  })
  return data.data
}

export async function renameExRelatedParty(
  relatedparty: string,
  newRelatedparty: string,
): Promise<ExRelatedParty> {
  const { data } = await http.put<DataResult<ExRelatedParty>>(
    `/ex-related-parties/${encodeURIComponent(relatedparty)}`,
    { newRelatedparty },
  )
  return data.data
}
