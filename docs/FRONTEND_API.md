# NBill 前端接口文档

本文档对应当前后端实现，供本地前端联调使用。默认地址为 `http://localhost:9081/api`。请求和响应均为 JSON；除登录外，所有接口都需要请求头：

```http
Authorization: Bearer <token>
Content-Type: application/json
```

金额字段均为十进制数，日期字段均为本地日历日期 `YYYY-MM-DD`。日期范围的起止日都包含在统计或筛选内。不要在前端用 UTC 时间转换日期字符串。

## 认证与通用错误

### 登录

`POST /auth/login`

```json
{ "username": "<配置中的用户名>", "password": "<用户输入>" }
```

成功 `200`：

```json
{
  "token": "<jwt>",
  "lastEditTime": "2026-09-11T01:23:45.000Z",
  "initialBalance": 10000
}
```

失败可能为 `400`（缺字段）、`401`（用户名或密码错误）。服务重启或退出后，即使旧 JWT 尚未过期，受保护接口也会返回 `401`，前端应清除 token 并回到登录页。

### 退出

`POST /auth/logout`。成功 `200`：`{ "message": "Logged out successfully" }`。退出会先保存，再清除内存中的解密数据。

### 错误约定

```json
{ "error": "可显示或记录的错误说明" }
```

| 状态码 | 前端处理 |
| --- | --- |
| `400` | 参数或业务校验错误，显示 `error` |
| `401` | 未登录、token 失效或会话未加载，回登录页 |
| `403` | 记录超出编辑窗口，提示用户是否执行历史纠错 |
| `404` | 资源不存在，刷新列表 |
| `500` | 服务内部错误，保留用户输入并提示重试 |

## 系统接口

### 状态

`GET /status`

返回 `authenticated`、`username`、`lastEditTime`、`initialBalance`、`editWindowDays`，以及 `counts` 下六张业务表的记录数。

### 立即保存

`POST /save`

成功返回：

```json
{ "message": "Data saved successfully", "lastEditTime": "2026-09-11T01:23:45.000Z" }
```

普通增删改已有自动保存，一般无需每次调用此接口；可在用户主动点击“保存”时调用。

## 日常收支 `/transactions`

记录结构：

```json
{
  "ID": 12,
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

- `Type` 只能是 `Income` 或 `Expense`。
- `Category`、`Subcategory` 必须是字典中同一 `Type` 下的有效组合。
- `Tag` 可为空；多个标签用英文逗号分隔，每项必须存在于标签字典。
- `Amount` 必须是有限正数，不能传 `"12abc"`、0 或负数。
- 新增日期不能是未来日期。

### 列表

`GET /transactions`

可选参数：`type`、`category`、`subcategory`、`tag`、`description`、`amountMin`、`amountMax`、`dateFrom`、`dateTo`、`page`、`limit`、`sortBy`、`sortOrder`。

- `description` 为模糊匹配，其余分类字段精确匹配。
- `page` 默认 1；`limit` 默认 100、最大 500。
- `sortOrder` 为 `asc` 或 `desc`，默认按 `BillDate desc`。

```json
{ "data": [{ "ID": 12 }], "total": 854, "page": 1, "limit": 100 }
```

### 详情、新增、删除

- `GET /transactions/:id` → `200 { "data": record }`
- `POST /transactions` → `201 { "data": record }`
- `DELETE /transactions/:id` → `200 { "message": "Transaction deleted" }`

新增时提交除 `ID` 外的记录字段。删除仍受编辑窗口限制，历史记录不能通过确认参数删除。

### 修改与历史纠错

`PUT /transactions/:id`，请求体只放需要修改的字段。`BillDate` 不可修改。

编辑窗口内成功响应保持为：

```json
{ "data": { "ID": 12, "Amount": 40 } }
```

窗口外默认返回 `403`。用户明确确认后，改用：

```http
PUT /transactions/12?confirmHistoricalEdit=true
```

后端会先保存当前内存数据、创建完整备份，再运行原有字段校验和修改。成功响应：

```json
{
  "data": { "ID": 12, "Amount": 40 },
  "historicalEdit": true,
  "backupCreated": true
}
```

参数必须精确为小写字符串 `true`。保存、备份或业务校验失败时不执行修改。

## 外部资金往来 `/external-transactions`

记录结构：

```json
{
  "ID": 9,
  "RelatedID": "7,8",
  "Type": "IN",
  "FlowDate": "2026-09-11",
  "Description": "朋友还款",
  "FlowType": "还款",
  "RelatedParty": "张三",
  "Amount": 500
}
```

- `Type` 只能是 `IN`（现金流入）或 `OUT`（现金流出）。
- `FlowType`、`RelatedParty` 必须存在于对应字典。
- `RelatedID` 可为空，多个 ID 用英文逗号分隔，且必须引用其他已存在的往来记录。

接口与日常收支一致：

- `GET /external-transactions`，筛选参数为 `type`、`flowType`、`relatedParty`、`description`、金额/日期/分页/排序参数。
- `GET /external-transactions/:id`；响应记录额外带 `relatedTransactions` 数组。
- `POST /external-transactions`。
- `PUT /external-transactions/:id`；`FlowDate` 不可修改。
- `DELETE /external-transactions/:id`。

列表响应为 `{ data, total, page, limit }`；详情、更新响应为 `{ data }`；新增成功状态为 `201`，其余成功状态为 `200`。新增请求体就是上方记录结构去掉 `ID`；`RelatedID` 可省略。删除成功返回 `{ "message": "External transaction deleted" }`。字段校验失败为 `400`，详情或更新目标不存在为 `404`，历史更新/删除未确认时为 `403`。

窗口外纠错使用 `PUT /external-transactions/:id?confirmHistoricalEdit=true`，成功时同样增加 `historicalEdit`、`backupCreated`。

## 字典接口

字典项只支持查询、新增和重命名，不提供删除；重命名会级联更新已有流水。路径参数务必用 `encodeURIComponent()`。

| 资源 | GET | POST 请求体 | PUT 与请求体 |
| --- | --- | --- | --- |
| 分类 | `/bill-categories?type=Expense` | `{ Type, Category, Subcategory, Description }` | `/bill-categories/:category/:subcategory`，`{ newCategory?, newSubcategory?, newDescription? }` |
| 标签 | `/bill-tags?appliesTo=Expense` | `{ Tag, Description, AppliesTo }` | `/bill-tags/:tag`，`{ newTag?, newDescription?, newAppliesTo? }` |
| 往来类型 | `/ex-flow-types` | `{ Flowtype }` | `/ex-flow-types/:flowtype`，`{ newFlowtype }` |
| 往来方 | `/ex-related-parties` | `{ Relatedparty }` | `/ex-related-parties/:relatedparty`，`{ newRelatedparty }` |

`AppliesTo` 只能是 `Expense`、`Income` 或 `Both`。GET 分类响应包含原始 `data` 以及便于级联选择器使用的 `grouped`。

所有字典 GET 成功为 `200`：分类返回 `{ data, grouped }`，其余返回 `{ data }`。POST 成功为 `201 { data }`，PUT 成功为 `200 { data }`；重复、缺字段或枚举错误为 `400`，PUT 目标不存在为 `404`。字典字段均为字符串且创建时必填，描述字段可按对应表定义传空字符串。

## 分析接口

### 统一日期参数

完整分析和摘要接受 `dateFrom`、`dateTo`；均为可选、闭区间。`dateTo` 默认今天，`dateFrom` 省略表示从最早数据开始。非法日期、未来结束日或 `dateFrom > dateTo` 返回 `400`。

期内经营统计只看该范围；`openingCashBalance` 会自动累计范围开始前的所有现金变动，因此：

```text
netIncome = totalIncome - totalExpense
externalNetCashFlow = externalIn - externalOut
closingCashBalance = openingCashBalance + netIncome + externalNetCashFlow
```

初始余额不再计入收入，外部往来也不再计入经营收入/支出。

### 仪表盘摘要

`GET /analytics/summary?dateFrom=2026-09-01&dateTo=2026-09-11`

```json
{
  "period": { "dateFrom": "2026-09-01", "dateTo": "2026-09-11" },
  "cash": {
    "openingCashBalance": 10000,
    "closingCashBalance": 10939.5,
    "periodCashChange": 939.5
  },
  "operating": {
    "totalIncome": 2000,
    "totalExpense": 60.5,
    "netIncome": 1939.5,
    "savingsRate": 96.98
  },
  "external": {
    "totalIn": 500,
    "totalOut": 1500,
    "netCashFlow": -1000,
    "outstandingAmount": 1000
  },
  "comparison": {
    "period": { "dateFrom": "2026-08-21", "dateTo": "2026-08-31" },
    "incomePercent": null,
    "expensePercent": 12.5,
    "netIncomePercent": null
  },
  "topExpenseCategories": [{ "category": "餐饮食品", "amount": 60.5, "percent": 100 }]
}
```

对比期是紧邻当前范围、天数相同的前一时段。前期值为 0 时对应百分比为 `null`，前端应显示 `—`，不要显示 0% 或 Infinity。

### 往来款余额

`GET /analytics/external-outstanding?asOf=2026-09-11&status=open&relatedParty=张三`

- `asOf` 默认今天且不能在未来。
- `status` 可选：`open`、`settled`、`overpaid`、`unmatched-in`。
- `relatedParty` 精确匹配；应使用 URL 编码。

```json
{
  "asOf": "2026-09-11",
  "filters": { "relatedParty": "张三", "status": "open" },
  "summary": {
    "totalGroups": 1,
    "openGroups": 1,
    "settledGroups": 0,
    "overpaidGroups": 0,
    "unmatchedInGroups": 0,
    "totalOutstanding": 1000,
    "totalOverpaid": 0
  },
  "groups": [{
    "groupId": 7,
    "transactionIds": [7, 9],
    "parties": ["张三"],
    "earliestOutDate": "2026-08-01",
    "totalOut": 1500,
    "totalIn": 500,
    "outstandingAmount": 1000,
    "overpaidAmount": 0,
    "status": "open",
    "ageDays": 41,
    "danglingRelatedIds": []
  }],
  "byParty": [{ "party": "张三", "openGroups": 1, "oldestAgeDays": 41, "outstandingAmount": 1000 }]
}
```

关联是无向连通组：一条还款可关联多笔借出，多条记录只聚合一次。未偿金额为 `max(OUT 合计 - IN 合计, 0)`，不是简单按记录数量判断完成状态。

### 数据质量

`GET /analytics/data-quality`

该接口只读，不自动修复。即使发现问题也返回 `200`：

```json
{
  "healthy": false,
  "checkedAt": "2026-09-11T02:00:00.000Z",
  "summary": { "error": 1, "warning": 0, "total": 1 },
  "issues": [{
    "severity": "error",
    "code": "DANGLING_RELATED_ID",
    "table": "externalTransactions",
    "index": 3,
    "id": 9,
    "message": "Related ID does not exist: 99"
  }]
}
```

可能的 `code`：`INVALID_ID`、`DUPLICATE_ID`、`INVALID_DATE`、`INVALID_AMOUNT`、`INVALID_TYPE`、`UNKNOWN_CATEGORY`、`UNKNOWN_TAG`、`UNKNOWN_FLOW_TYPE`、`UNKNOWN_RELATED_PARTY`、`DANGLING_RELATED_ID`、`COUNTER_BEHIND`。建议设置页展示问题列表，不要仅依赖 `healthy`。

### 完整分析

`GET /analytics?dateFrom=2026-01-01&dateTo=2026-09-11`

顶层字段：

| 字段 | 内容 |
| --- | --- |
| `period` | 实际统计区间 |
| `computedAt` | ISO 计算时间 |
| `basicStats` | 概览、分位数、极值、历史最高现金、全表记录数 |
| `cashBalanceTrend` | 按配置月份间隔的现金余额点 |
| `monthlySummary` | 月收入、月支出、净收入、支出/收入笔数、每笔支出均值等 |
| `categoryAnalysis` | 一级/二级分类笔数和金额 |
| `amountDistribution` | 收入、支出的金额分桶 |
| `externalAnalysis` | 期内往来现金流、截至期末的未偿组与往来方聚合 |
| `bonus` | 储蓄率、环比同比、星期支出、Pareto、标签、频次金额、异常、年度 Top |

`basicStats.overview` 的稳定字段：

```json
{
  "totalIncome": 2000,
  "totalExpense": 60.5,
  "netIncome": 1939.5,
  "netBalance": 1939.5,
  "initialBalance": 10000,
  "openingCashBalance": 10000,
  "externalIn": 500,
  "externalOut": 1500,
  "externalNetCashFlow": -1000,
  "closingCashBalance": 10939.5,
  "currentCashBalance": 10939.5
}
```

兼容别名：`netBalance === netIncome`，`currentCashBalance === closingCashBalance`。新前端优先使用语义更明确的 `netIncome` 和 `closingCashBalance`。

重要子字段变更：

- `monthlySummary[]` 使用 `expenseCount`、`incomeCount`、`avgPerExpense`；不再使用错误的 `avgPerTransaction`。
- `bonus.dayOfWeek[]` 只统计支出，字段为 `expenseCount`、`expenseAmount`、`averageExpense`。
- `bonus.savingsRate[].savingsRate` 在收入为 0 时是 `null`。
- `bonus.pareto[].isCore` 会包含跨过累计 80% 阈值的那一项。
- `basicStats.maxHistoricalCash` 额外返回 `source`；初始余额为最高点时 `date` 为 `null`、`source` 为 `initialBalance`。
- 已移除误导字段 `basicStats.externalProfit`。请改用 `externalNetCashFlow` 或 `externalAnalysis.outstanding.totalOutstanding`。

## 可复制的 fetch 封装

```js
const API_BASE = 'http://localhost:9081/api';

async function api(path, options = {}) {
  const token = localStorage.getItem('nbillToken');
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const body = await response.json();
  if (response.status === 401) localStorage.removeItem('nbillToken');
  if (!response.ok) throw Object.assign(new Error(body.error || 'Request failed'), {
    status: response.status,
    body,
  });
  return body;
}

const dashboard = await api('/analytics/summary?dateFrom=2026-09-01&dateTo=2026-09-11');
const outstanding = await api('/analytics/external-outstanding?status=open');
const quality = await api('/analytics/data-quality');

await api('/transactions/12?confirmHistoricalEdit=true', {
  method: 'PUT',
  body: JSON.stringify({ Amount: 40 }),
});
```

## 前端迁移清单

1. Base URL 改为当前配置端口 `9081`。
2. 仪表盘首屏优先请求 `/analytics/summary`，详情页再请求完整 `/analytics`。
3. 收入/支出不要再混入初始余额和外部往来。
4. 替换 `externalProfit`、`avgPerTransaction`、旧星期字段和 `isTop20`。
5. 对所有百分比字段支持 `null`。
6. 收到历史修改 `403` 时二次确认；只有用户确认后追加查询参数。
7. 设置页增加 `/analytics/data-quality` 的只读诊断展示。
