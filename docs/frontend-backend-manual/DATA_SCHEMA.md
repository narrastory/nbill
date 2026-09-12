# 数据表结构与关系

NBill 不使用数据库，但逻辑上维护六张业务表。API 中的字段名区分大小写，前端应始终使用本文列出的标准字段名。

## 关系总览

```text
BillCategories ──< Transactions >── BillTags
                         
ExFlowType ──< ExternalTransactions >── ExRelatedParty
                       │
                       └── RelatedID ──> ExternalTransactions.ID
```

- `Transactions` 是普通收入和普通支出。
- `ExternalTransactions` 是不计入经营收入/支出的外部现金往来。
- 其余四张表是字典表。
- 字典没有数字 ID，以名称作为引用值。

## 1. Transactions

普通收支表，持久化文件是加密文件。

| 字段 | JSON 类型 | 必填 | 可修改 | 规则 |
| --- | --- | --- | --- | --- |
| `ID` | integer | 后端生成 | 否 | 正整数，全表唯一 |
| `Type` | string | 是 | 是 | `Income` 或 `Expense` |
| `BillDate` | string | 是 | 否 | `YYYY-MM-DD`，新增时不能是未来 |
| `Category` | string | 是 | 是 | 必须存在于分类表 |
| `Subcategory` | string | 是 | 是 | 必须和 Category 构成有效组合 |
| `Description` | string | 是 | 是 | 非空摘要 |
| `Tag` | string | 否 | 是 | 空字符串或英文逗号分隔的标签名 |
| `Amount` | number | 是 | 是 | 有限正数，大于 0 |
| `Notes` | string | 否 | 是 | 备注，可为空字符串 |

示例：

```json
{
  "ID": 120,
  "Type": "Expense",
  "BillDate": "2026-09-11",
  "Category": "餐饮食品",
  "Subcategory": "正餐",
  "Description": "午餐",
  "Tag": "主动选择,家庭",
  "Amount": 35.5,
  "Notes": ""
}
```

业务关系：

- `(Type, Category, Subcategory)` 应对应 BillCategories 中的一项。
- `Tag` 中每个逗号分隔值都应对应 BillTags.Tag。
- 标签字符串建议由前端数组 `tags.join(',')` 生成，不要使用中文逗号。

## 2. BillCategories

普通收支分类表，持久化文件是明文 JSON。

| 字段 | 类型 | 必填 | 规则 |
| --- | --- | --- | --- |
| `Type` | string | 是 | `Income` 或 `Expense` |
| `Category` | string | 是 | 一级分类，非空 |
| `Subcategory` | string | 是 | 二级分类，非空 |
| `Description` | string | 否 | 分类说明，默认空字符串 |

逻辑唯一键为 `(Type, Category, Subcategory)`。API 不提供删除，只能新增和重命名。重命名 Category 或 Subcategory 会级联更新引用它的普通流水。

```json
{
  "Type": "Expense",
  "Category": "餐饮食品",
  "Subcategory": "正餐",
  "Description": "食堂、饭店、快餐"
}
```

## 3. BillTags

普通流水标签表，持久化文件是明文 JSON。

| 字段 | 类型 | 必填 | 规则 |
| --- | --- | --- | --- |
| `Tag` | string | 是 | 唯一、非空 |
| `Description` | string | 否 | 默认空字符串 |
| `AppliesTo` | string | 否 | `Expense`、`Income` 或 `Both`；默认 `Both` |

API 不提供删除。标签重命名会在所有普通流水的逗号分隔 `Tag` 中级联替换。

```json
{
  "Tag": "主动选择",
  "Description": "主动决定的消费",
  "AppliesTo": "Expense"
}
```

注意：后端创建/更新流水时只检查标签是否存在，不会根据 `AppliesTo` 阻止标签用于另一类流水。前端应使用 `AppliesTo` 限制可选项：当前 Type 或 `Both`。

## 4. ExternalTransactions

外部资金往来表，持久化文件是加密文件。

| 字段 | JSON 类型 | 必填 | 可修改 | 规则 |
| --- | --- | --- | --- | --- |
| `ID` | integer | 后端生成 | 否 | 正整数，全表唯一 |
| `RelatedID` | string | 否 | 是 | 空字符串或英文逗号分隔的其他记录 ID |
| `Type` | string | 是 | 是 | `IN` 或 `OUT` |
| `FlowDate` | string | 是 | 否 | `YYYY-MM-DD`，新增时不能是未来 |
| `Description` | string | 是 | 是 | 非空摘要 |
| `FlowType` | string | 是 | 是 | 必须存在于 ExFlowType |
| `RelatedParty` | string | 是 | 是 | 必须存在于 ExRelatedParty |
| `Amount` | number | 是 | 是 | 有限正数，大于 0 |

```json
{
  "ID": 9,
  "RelatedID": "7,8",
  "Type": "IN",
  "FlowDate": "2026-09-11",
  "Description": "朋友归还两笔借款",
  "FlowType": "还款",
  "RelatedParty": "张三",
  "Amount": 500
}
```

`Type` 的现金方向：

| Type | 含义 | 对现金余额 |
| --- | --- | --- |
| `OUT` | 钱离开当前账户，例如借出、垫付 | 减少 |
| `IN` | 钱进入当前账户，例如归还、收回 | 增加 |

`RelatedID` 的典型用法：后发生的归还记录指向先前的借出记录。例如 ID 9 的 `RelatedID="7,8"` 表示这笔流入与 ID 7、8 属于同一往来组。

后端详情接口会额外计算 `relatedTransactions`，这个字段不是表字段，不应在 POST/PUT 时提交。

## 5. ExFlowType

外部往来类型字典，持久化文件是明文 JSON。

| 字段 | 类型 | 必填 | 规则 |
| --- | --- | --- | --- |
| `Flowtype` | string | 是 | 唯一、非空；注意字段名是小写 `t` |

```json
{ "Flowtype": "借款" }
```

API 不提供删除。重命名会级联更新所有 ExternalTransactions.FlowType。

## 6. ExRelatedParty

往来方字典，持久化文件是加密文件。

| 字段 | 类型 | 必填 | 规则 |
| --- | --- | --- | --- |
| `Relatedparty` | string | 是 | 唯一、非空；注意字段名是小写 `p` |

```json
{ "Relatedparty": "张三" }
```

API 不提供删除。重命名会级联更新所有 ExternalTransactions.RelatedParty。

## 前端 TypeScript 类型

```ts
export type TransactionType = 'Income' | 'Expense';
export type ExternalType = 'IN' | 'OUT';
export type TagAppliesTo = 'Income' | 'Expense' | 'Both';

export interface Transaction {
  ID: number;
  Type: TransactionType;
  BillDate: string;
  Category: string;
  Subcategory: string;
  Description: string;
  Tag: string;
  Amount: number;
  Notes: string;
}

export interface BillCategory {
  Type: TransactionType;
  Category: string;
  Subcategory: string;
  Description: string;
}

export interface BillTag {
  Tag: string;
  Description: string;
  AppliesTo: TagAppliesTo;
}

export interface ExternalTransaction {
  ID: number;
  RelatedID: string;
  Type: ExternalType;
  FlowDate: string;
  Description: string;
  FlowType: string;
  RelatedParty: string;
  Amount: number;
}

export interface ExFlowType {
  Flowtype: string;
}

export interface ExRelatedParty {
  Relatedparty: string;
}
```

## 数据保存特征

- 登录后，数据解密到后端内存；前端永远不直接访问数据文件。
- 每次变更会标记为待保存，通常在最后一次变更约 2 秒后自动保存。
- 另有周期保存、手动保存、退出保存和正常关闭保存。
- 前端收到成功写响应后可立即更新界面，不需要等待 `/api/save`。

