# API 参考

本文档列出当前后端的全部接口。除 `POST /api/auth/login` 外，均需在请求头携带 `Authorization: Bearer <token>`。

## 通用约定

- 根地址：`http://localhost:9081/api`
- 请求与响应：`application/json`
- 日期：严格使用 `YYYY-MM-DD`，日期区间首尾均包含。
- 金额：JSON number；前端输入转成 number 后再提交，不要提交带货币符号或千分位的字符串。
- 空值：未提供的可选筛选参数应省略，不要发送字符串 `"null"` 或 `"undefined"`。
- 路径参数：分类、标签、往来类型、往来方必须用 `encodeURIComponent` 编码。
- 成功列表：`{ data, total, page, limit }`；成功详情和写操作通常为 `{ data }`。
- 通用失败：`{ "error": "可展示或记录的错误信息" }`。
- 未匹配的 API：HTTP `404`，`{ "error": "API endpoint not found" }`。
- 未处理的服务端异常：HTTP `500`，`{ "error": "Internal server error" }`。

## 认证与系统

### POST `/auth/login`

唯一不需要 token 的接口。

请求：

```json
{
  "username": "用户输入的用户名",
  "password": "用户输入的密码"
}
```

成功 `200`：

```json
{
  "token": "jwt-token",
  "lastEditTime": "2026-09-11T09:30:00.000Z",
  "initialBalance": 13038.7
}
```

失败：缺字段为 `400`；用户名或密码错误为 `401`。前端不得保存或打印密码，token 可保存在内存或 `sessionStorage`。

### POST `/auth/logout`

保存当前数据并结束内存会话。成功 `200`：

```json
{ "message": "Logged out successfully" }
```

### GET `/status`

用于登录后的应用初始化。

```json
{
  "authenticated": true,
  "username": "当前用户",
  "lastEditTime": "2026-09-11T09:30:00.000Z",
  "initialBalance": 13038.7,
  "editWindowDays": 45,
  "counts": {
    "transactions": 854,
    "externalTransactions": 44,
    "billCategories": 90,
    "billTags": 7,
    "exFlowType": 6,
    "exRelatedParty": 4
  }
}
```

### POST `/save`

主动将内存数据持久化。一般写接口已会保存；该接口适合“立即保存”按钮或退出前兜底。

```json
{
  "message": "Data saved successfully",
  "lastEditTime": "2026-09-11T09:35:00.000Z"
}
```

## 普通收支 `/transactions`

字段定义见 [DATA_SCHEMA.md](./DATA_SCHEMA.md#1-普通收支-transaction)。

### GET `/transactions`

查询参数：

| 参数 | 含义 |
| --- | --- |
| `type` | `Income` 或 `Expense` |
| `category` / `subcategory` | 一级/二级分类精确匹配 |
| `tag` | 在逗号分隔标签中精确匹配单个标签 |
| `description` | 描述不区分大小写的包含匹配 |
| `amountMin` / `amountMax` | 金额下限/上限 |
| `dateFrom` / `dateTo` | 账单日期范围 |
| `page` / `limit` | 默认 `1` / `100`，`limit` 最大 `500` |
| `sortBy` / `sortOrder` | 排序字段与 `asc`/`desc`；默认 `BillDate desc` |

响应：

```json
{
  "data": [
    {
      "ID": 101,
      "Type": "Expense",
      "Category": "餐饮",
      "Subcategory": "午餐",
      "Description": "工作日午餐",
      "Amount": 28.5,
      "BillDate": "2026-09-10",
      "Tags": "工作日,餐饮"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 100
}
```

后端对列表中的日期和金额查询参数较宽容，前端仍应在发请求前校验其格式、有限数值和上下限顺序。

### GET `/transactions/:id`

成功 `200` 返回 `{ "data": Transaction }`。非整数 ID 为 `400`；不存在为 `404`。

### POST `/transactions`

请求不传 `ID`：

```json
{
  "Type": "Expense",
  "Category": "餐饮",
  "Subcategory": "午餐",
  "Description": "工作日午餐",
  "Amount": 28.5,
  "BillDate": "2026-09-10",
  "Tags": "工作日,餐饮"
}
```

成功 `201` 返回 `{ "data": Transaction }`；业务校验失败为 `400`。

### PUT `/transactions/:id`

请求体可提交要更新的业务字段，但 `BillDate` 不可修改。成功返回 `{ "data": Transaction }`。

超过编辑窗口时首次请求返回 `403`。用户确认后，使用完全一致的小写参数：

```text
PUT /transactions/101?confirmHistoricalEdit=true
```

确认成功时后端先创建备份，再返回：

```json
{
  "data": {},
  "historicalEdit": true,
  "backupCreated": true
}
```

### DELETE `/transactions/:id`

成功 `200`：`{ "message": "Transaction deleted" }`。历史记录删除没有确认绕过机制，超过编辑窗口时不能删除。

## 外部往来 `/external-transactions`

字段定义和关联方式见 [DATA_SCHEMA.md](./DATA_SCHEMA.md#2-外部往来-externaltransaction) 与 [BUSINESS_RULES.md](./BUSINESS_RULES.md#外部往来与未结清金额)。

### GET `/external-transactions`

查询参数：`type`、`flowType`、`relatedParty`、`description`、`amountMin`、`amountMax`、`dateFrom`、`dateTo`、`page`、`limit`、`sortBy`、`sortOrder`。分页规则与普通收支相同，默认 `FlowDate desc`。

列表响应不展开关联记录：

```json
{
  "data": [
    {
      "ID": 21,
      "Type": "Out",
      "Flowtype": "借出",
      "Relatedparty": "朋友A",
      "Description": "临时周转",
      "Amount": 500,
      "FlowDate": "2026-08-01",
      "RelatedID": "21,25"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 100
}
```

### GET `/external-transactions/:id`

详情额外返回已解析的 `relatedTransactions`：

```json
{
  "data": {
    "ID": 21,
    "Type": "Out",
    "Flowtype": "借出",
    "Relatedparty": "朋友A",
    "Description": "临时周转",
    "Amount": 500,
    "FlowDate": "2026-08-01",
    "RelatedID": "21,25",
    "relatedTransactions": [
      { "ID": 25, "Type": "In", "Description": "归还部分", "Amount": 200, "FlowDate": "2026-08-15" }
    ]
  }
}
```

非整数 ID 为 `400`；不存在为 `404`。

### POST `/external-transactions`

```json
{
  "Type": "Out",
  "Flowtype": "借出",
  "Relatedparty": "朋友A",
  "Description": "临时周转",
  "Amount": 500,
  "FlowDate": "2026-08-01",
  "RelatedID": "21,25"
}
```

不传 `ID`。`RelatedID` 可省略；如填写，只使用以英文逗号分隔的正整数 ID。成功 `201` 返回 `{ "data": ExternalTransaction }`。

### PUT `/external-transactions/:id`

`FlowDate` 不可修改。历史记录确认方式与普通收支相同：`?confirmHistoricalEdit=true`，确认成功也返回 `historicalEdit` 和 `backupCreated`。

### DELETE `/external-transactions/:id`

成功：`{ "message": "External transaction deleted" }`。历史记录超过编辑窗口后不能删除。

## 字典接口

字典没有删除接口。重命名会级联更新引用它的流水；提交期间应禁用重复操作并在成功后刷新相关列表。

### GET `/bill-categories`

可选 `type=Income|Expense` 只过滤 `data`；`grouped` 始终包含全部分组。

```json
{
  "data": [
    { "Type": "Expense", "Category": "餐饮", "Subcategory": "午餐", "Description": "" }
  ],
  "grouped": {
    "Expense": { "餐饮": [{ "subcategory": "午餐", "description": "" }] },
    "Income": {}
  }
}
```

- `POST /bill-categories`：请求 `{ Type, Category, Subcategory, Description? }`，成功 `201`。
- `PUT /bill-categories/:category/:subcategory`：请求 `{ newCategory?, newSubcategory?, newDescription? }`，成功 `200`；不存在为 `404`。

### GET `/bill-tags`

可选 `appliesTo=Income|Expense|Both` 精确筛选，返回 `{ "data": [...] }`。

- `POST /bill-tags`：`{ Tag, Description?, AppliesTo? }`；`AppliesTo` 省略时为 `Both`，成功 `201`。
- `PUT /bill-tags/:tag`：`{ newTag?, newDescription?, newAppliesTo? }`。`newAppliesTo` 只提交 `Income`、`Expense` 或 `Both`。

### GET `/ex-flow-types`

返回 `{ "data": [{ "Flowtype": "借出" }] }`。

- `POST /ex-flow-types`：`{ Flowtype }`，成功 `201`。
- `PUT /ex-flow-types/:flowtype`：`{ newFlowtype }`，成功 `200`。

### GET `/ex-related-parties`

返回 `{ "data": [{ "Relatedparty": "朋友A" }] }`。

- `POST /ex-related-parties`：`{ Relatedparty }`，成功 `201`。
- `PUT /ex-related-parties/:relatedparty`：`{ newRelatedparty }`，成功 `200`。

## 分析接口

分析日期参数首尾均包含。`dateTo` 省略时默认为今天；`dateFrom` 可省略。非法日历日期、未来结束日期、开始晚于结束均返回 `400`。

### GET `/analytics/summary`

参数：`dateFrom`、`dateTo`。适合首页卡片和分类排行。

```json
{
  "period": { "dateFrom": "2026-09-01", "dateTo": "2026-09-11" },
  "cash": { "openingCashBalance": 20000, "closingCashBalance": 21500, "periodCashChange": 1500 },
  "operating": { "totalIncome": 5000, "totalExpense": 3000, "netIncome": 2000, "savingsRate": 40 },
  "external": { "totalIn": 200, "totalOut": 700, "netCashFlow": -500, "outstandingAmount": 500 },
  "comparison": {
    "period": { "dateFrom": "2026-08-21", "dateTo": "2026-08-31" },
    "incomePercent": 25,
    "expensePercent": -10,
    "netIncomePercent": null
  },
  "topExpenseCategories": [{ "category": "餐饮", "amount": 1000, "percent": 33.33 }]
}
```

只有提供 `dateFrom` 才计算等长、紧邻的上一周期。上一周期基数为零时，对应同比值为 `null`，前端应显示 `--`，不要显示 `0%`。

### GET `/analytics/external-outstanding`

参数：

- `asOf`：截止日期，默认今天，不允许未来日期。
- `status`：`open`、`settled`、`overpaid`、`unmatched-in`。
- `relatedParty`：往来方精确筛选。

```json
{
  "asOf": "2026-09-11",
  "filters": { "relatedParty": null, "status": "open" },
  "summary": {
    "totalGroups": 2,
    "openGroups": 2,
    "settledGroups": 0,
    "overpaidGroups": 0,
    "unmatchedInGroups": 0,
    "totalOutstanding": 800,
    "totalOverpaid": 0
  },
  "groups": [
    {
      "groupId": "21",
      "transactionIds": [21, 25],
      "parties": ["朋友A"],
      "earliestOutDate": "2026-08-01",
      "totalOut": 500,
      "totalIn": 200,
      "outstandingAmount": 300,
      "overpaidAmount": 0,
      "status": "open",
      "ageDays": 41,
      "danglingRelatedIds": []
    }
  ],
  "byParty": [{ "party": "朋友A", "openGroups": 1, "oldestAgeDays": 41, "outstandingAmount": 300 }]
}
```

`byParty` 只汇总未结清组。`danglingRelatedIds` 非空表示关联 ID 已失效，UI 应显示数据异常提示。

### GET `/analytics/data-quality`

无参数。即使发现问题也返回 `200`，必须读取 `healthy`，不能用 HTTP 状态判断数据健康。

```json
{
  "healthy": false,
  "checkedAt": "2026-09-11T09:40:00.000Z",
  "summary": { "error": 1, "warning": 0, "total": 1 },
  "issues": [
    { "severity": "error", "code": "INVALID_AMOUNT", "table": "transactions", "index": 3, "id": 10, "message": "..." }
  ]
}
```

问题代码和处置建议见 [BUSINESS_RULES.md](./BUSINESS_RULES.md#数据质量检查)。

### GET `/analytics`

完整分析接口，计算量和响应体都大于 summary；适合分析页按需加载，不要在每次路由切换时调用。

顶层结构：

```ts
interface FullAnalytics {
  computedAt: string;
  period: { dateFrom: string | null; dateTo: string };
  basicStats: {
    overview: {
      totalIncome: number; totalExpense: number; netIncome: number; netBalance: number;
      initialBalance: number; openingCashBalance: number;
      externalIn: number; externalOut: number; externalNetCashFlow: number;
      closingCashBalance: number; currentCashBalance: number;
    };
    quintiles: {
      income: { breakpoints: number[]; average: number; count: number };
      expense: { breakpoints: number[]; average: number; count: number };
    };
    extremes: {
      maxIncome: null | AnalyticsRecord;
      maxExpense: null | AnalyticsRecord;
    };
    maxHistoricalCash: { amount: number; date: string | null; source: 'initialBalance' | 'transaction' | 'externalTransaction' };
    recordCounts: Record<string, number>;
  };
  cashBalanceTrend: Array<{ date: string; balance: number }>;
  monthlySummary: MonthlySummary[];
  categoryAnalysis: CategoryAnalysis;
  amountDistribution: AmountDistribution;
  externalAnalysis: ExternalAnalysis;
  bonus: BonusAnalytics;
}
```

子结构字段：

- `AnalyticsRecord`：`amount`、`billDate`、`category`、`subcategory`、`description`。
- `MonthlySummary`：`yearMonth`、`totalIncome`、`totalExpense`、`netProfit`、`frequency`、`expenseCount`、`incomeCount`、`foodExpense`、`nonFoodExpense`、`activeChoiceExpense`、`avgPerExpense`。
- `categoryAnalysis.timeWindow`：`months`、`startDate`、`endDate`；`byCategory` 每项含 `name`、`type`、`recordCount`、`totalAmount`；`bySubcategory` 另含 `parentCategory`。
- `amountDistribution.income/expense`：每项 `{ min, max, count }`；区间规则为 `(min, max]`，`max: null` 表示无穷大。
- `externalAnalysis`：`cashFlow`（`totalIn`、`totalOut`、`netCashFlow`）、`outstanding` 摘要、`groups`、`byParty`。
- `bonus.savingsRate`：`year`、`totalIncome`、`totalExpense`、`savingsRate`。
- `bonus.monthlyTrends`：`yearMonth`、`expenseMoM`、`incomeMoM`、`expenseYoY`、`incomeYoY`，百分比可为 `null`。
- `bonus.dayOfWeek`：`dayOfWeek`、`dayName`、`expenseCount`、`expenseAmount`、`averageExpense`。
- `bonus.pareto`：`subcategory`、`category`、`amount`、`percent`、`cumulativePercent`、`isCore`。
- `bonus.tagAnalysis`：`tag`、`count`、`totalAmount`、`byCategory[{ category, count, totalAmount }]`。
- `bonus.frequencyAmount`：`subcategory`、`category`、`type`、`frequency`、`totalAmount`、`avgAmount`。
- `bonus.anomalies`：`subcategory`、`yearMonth`、`amount`、`mean`、`stddev`、`threshold`、`excessPercent`。
- `bonus.topRecords`：按年提供 `topExpenses`、`topIncomes`，记录含 `id`、`amount`、`billDate`、`category`、`subcategory`、`description`。

该接口每次实时计算，前端可以按筛选条件缓存本次页面会话结果，但写入流水后必须使相关缓存失效。

## HTTP 状态处理表

| 状态 | 前端处理 |
| --- | --- |
| `200` | 成功读取/修改/删除 |
| `201` | 创建成功 |
| `400` | 展示表单或查询参数错误，不要自动重试 |
| `401` | 清 token，跳转登录页 |
| `403` | 若为历史编辑，弹确认框后带确认参数重试一次 |
| `404` | 记录不存在或接口路径错误；返回列表并刷新 |
| `409` | 字典重复等冲突，保留输入让用户修改 |
| `500` | 展示通用错误，保留表单内容，不要循环重试 |

