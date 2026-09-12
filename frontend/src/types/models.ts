/**
 * 后端业务实体类型。
 *
 * ⚠️ 字段大小写以后端实际返回为准，不要"顺手改成 camelCase"。
 * 已用 http://localhost:9081 真实响应核对（2026-09-11），三个易错点：
 *
 *  1. 普通流水的标签字段是单数 `Tag`（逗号分隔字符串），不是 `Tags`。
 *     手册中 API_REFERENCE.md / FETCH_EXAMPLES.md 的 POST 示例写成 `Tags` 是错的。
 *  2. 外部往来流水用驼峰 `FlowType` / `RelatedParty`。
 *     CHANGELOG_FOR_FRONTEND.md 声称要写小写 `Flowtype` / `Relatedparty` —— 该说法针对的是
 *     字典表（ExFlowType / ExRelatedParty），套到流水上会得到 `FlowType is required` 400。
 *  3. 字典表本身确实是小写：`Flowtype`、`Relatedparty`。
 *     即：流水驼峰、字典小写，二者不同名不同大小写，不要合并成一个类型。
 */

export type TransactionType = 'Income' | 'Expense'
export type ExternalType = 'IN' | 'OUT'
export type TagAppliesTo = 'Income' | 'Expense' | 'Both'

/** 普通收支流水。日期字段为 `BillDate`。 */
export interface Transaction {
  ID: number
  Type: TransactionType
  BillDate: string
  Category: string
  Subcategory: string
  Description: string
  /** 英文逗号分隔的标签名；无标签时为空字符串。 */
  Tag: string
  Amount: number
  Notes: string
}

/** 新增/修改普通流水的请求体。`ID` 与 `BillDate` 不可修改。 */
export type TransactionInput = Omit<Transaction, 'ID' | 'BillDate'> & {
  BillDate?: string
}

/** 外部往来流水。日期字段为 `FlowDate`；字段名是小写 `t`/大写 `P` 的驼峰。 */
export interface ExternalTransaction {
  ID: number
  /** 英文逗号分隔的其他外部往来 ID；无关联时为空字符串。 */
  RelatedID: string
  Type: ExternalType
  FlowDate: string
  Description: string
  FlowType: string
  RelatedParty: string
  Amount: number
}

/** 详情接口才返回；不是表字段，POST/PUT 时不要提交。 */
export interface RelatedTransactionSummary {
  ID: number
  Type: ExternalType
  Description: string
  Amount: number
  FlowDate: string
}

export interface ExternalTransactionDetail extends ExternalTransaction {
  relatedTransactions: RelatedTransactionSummary[]
}

export type ExternalTransactionInput = Omit<ExternalTransaction, 'ID' | 'FlowDate'> & {
  FlowDate?: string
}

export interface BillCategory {
  Type: TransactionType
  Category: string
  Subcategory: string
  Description: string
}

/** 分类字典的 grouped 结构：Type → 一级分类 → 二级分类列表。 */
export type GroupedCategories = Record<
  TransactionType,
  Record<string, Array<{ subcategory: string; description: string }>>
>

export interface BillTag {
  Tag: string
  Description: string
  AppliesTo: TagAppliesTo
}

/** 往来类型字典：字段名是小写 t。 */
export interface ExFlowType {
  Flowtype: string
}

/** 往来方字典：字段名是小写 p。 */
export interface ExRelatedParty {
  Relatedparty: string
}

/** `GET /status` 的响应，用于登录后初始化。 */
export interface SystemStatus {
  authenticated: boolean
  username: string
  lastEditTime: string
  initialBalance: number
  editWindowDays: number
  counts: RecordCounts
}

export interface RecordCounts {
  transactions: number
  externalTransactions: number
  billCategories: number
  billTags: number
  exFlowType: number
  exRelatedParty: number
}

export interface LoginResponse {
  token: string
  lastEditTime: string
  initialBalance: number
}
