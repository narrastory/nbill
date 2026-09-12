# 前端接入指南

本指南给出页面组织、状态管理和交互策略。字段与接口细节分别以 [DATA_SCHEMA.md](./DATA_SCHEMA.md) 和 [API_REFERENCE.md](./API_REFERENCE.md) 为准。

## 建议页面

| 页面 | 主要接口 | 核心交互 |
| --- | --- | --- |
| 登录 | `POST /auth/login` | 登录失败保留用户名、清空密码 |
| 首页仪表盘 | `GET /status`、`GET /analytics/summary` | 余额、收支、未偿款、分类排行 |
| 日常收支 | `/transactions` | 筛选、分页、新增、编辑、删除 |
| 外部往来 | `/external-transactions`、`/analytics/external-outstanding` | 流水与业务组双视图 |
| 数据分析 | `GET /analytics` | 趋势、分类、分布、异常和排行 |
| 字典设置 | 四组字典接口 | 新增和重命名，无删除 |
| 数据检查 | `GET /analytics/data-quality` | 按严重程度和数据表展示问题 |

## 应用启动和会话

1. 登录成功后只保存 token，不保存密码。
2. 立即调用 `/status`，确认会话可用并取得 `editWindowDays`、初始余额和记录数。
3. 并行加载分类、标签、往来类型、往来方四组字典。
4. 加载当前页面的数据。首页只调轻量 `/analytics/summary`；进入分析页再调完整 `/analytics`。
5. 任意接口返回 `401`，立即清除 token、清空用户相关缓存并回到登录页。
6. 主动退出时调用 `/auth/logout`；无论其结果如何，前端最终都应清理本地会话。

后端重启会使已签发 token 对应的内存会话失效，因此“token 还没过期”不等于“会话一定可用”。

## API 客户端原则

- 集中封装 base URL、token、JSON 解析和错误对象，不要在组件中重复拼请求。
- 查询字符串只放有值的字段，并使用 `URLSearchParams`。
- 所有路径中的用户数据都使用 `encodeURIComponent`。
- 请求失败时先尝试读取 JSON 的 `error`，再使用 HTTP 状态的默认提示。
- `AbortError` 属于用户切换筛选或页面造成的正常取消，不弹错误通知。
- 写操作按钮在请求期间禁用，防止重复提交。

## 表单与字段处理

### 日期

- 使用本地日期字符串 `YYYY-MM-DD`，不要先转 UTC 再截取，否则东八区附近可能错一天。
- 分析接口的 `dateTo` 不允许未来日期。
- 编辑现有流水时把 `BillDate` 或 `FlowDate` 设为只读，因为后端不允许修改原始日期。
- 筛选条件应先校验 `dateFrom <= dateTo`。

### 金额

- 文本框值先去首尾空格，再转成有限 number。
- 禁止空值、`NaN`、无穷大及非正数。
- 展示统一用货币格式化器；业务运算使用原始 number，不从格式化文本反解析。
- 不要因为浮点显示问题在前端重新定义统计口径；后端结果是权威值。

### 分类和标签

- 普通流水先选择 `Type`，再从分类字典中过滤同 Type 的分类与子分类。
- 标签候选依据 `AppliesTo`：当前 Type 或 `Both`。
- `Tags` 在接口中是逗号分隔字符串；UI 内部宜维护 `string[]`，提交前用英文逗号连接。
- 标签名称本身不应包含英文逗号。

### 外部往来关联

- UI 内部将 `RelatedID` 维护为正整数数组；请求时去重、排序并用英文逗号连接。
- 列表接口不返回关联详情。只有用户打开详情时才调用 `GET /external-transactions/:id`。
- 未结清分析的 `groups` 是业务组，不等同于某一条流水；详情页应展示组内所有 `transactionIds`。

## 分页、筛选和排序

- 初次加载用 `page=1&limit=100`；大表格可选 20/50/100，不能超过 500。
- 任意筛选条件或排序条件变化后，页码重置为 1。
- 以后端返回的 `total` 计算总页数，不根据本页条数猜测是否还有下一页。
- 搜索输入建议 250–400ms 防抖；日期、类型和下拉筛选可立即请求。
- 新增、编辑、删除成功后重新请求当前列表，避免自行修改本地数组造成排序或页码错误。

## 历史记录编辑

后端以 `/status` 的 `editWindowDays` 判断记录是否过旧。

1. 普通 PUT 请求返回 `403` 时，读取错误信息并显示二次确认。
2. 用户确认后，仅重试原 PUT 一次，并追加 `confirmHistoricalEdit=true`。
3. 成功响应中的 `historicalEdit: true` 和 `backupCreated: true` 可用于成功提示。
4. 用户取消则保持原数据。
5. 历史记录删除不能绕过限制；UI 可依据日期预先禁用删除，但仍以服务端响应为准。

不要在第一次请求中默认附加确认参数，否则会跳过用户明确确认步骤。

## 写操作后的缓存失效

| 写操作 | 至少刷新/失效 |
| --- | --- |
| 普通收支新增/修改/删除 | 当前流水列表、summary、完整 analytics、status counts |
| 外部往来新增/修改/删除 | 当前往来列表、summary、external-outstanding、完整 analytics、status counts |
| 分类重命名 | 分类字典、普通流水列表、全部分析 |
| 标签重命名 | 标签字典、普通流水列表、完整 analytics |
| 往来类型/往来方重命名 | 对应字典、外部往来列表、往来分析 |

## 分析页面展示约定

- `savingsRate` 和各类变化百分比为 `null` 时显示 `--` 或“无可比基数”，不能显示 0。
- 正负颜色要按指标语义决定：支出增长通常是警示色，收入增长通常是积极色。
- `openingCashBalance` 与 `closingCashBalance` 是现金口径；`netIncome` 只含普通收支，不能混用。
- `topExpenseCategories.percent` 是占期间总支出的比例。
- 金额分布区间是 `(min, max]`；`max=null` 的标签应显示“高于 min”。
- `data-quality` 的 HTTP 200 不代表健康，页面以 `healthy` 和 `summary` 判断。

## 推荐前端 TypeScript 模型

业务实体类型已在 [DATA_SCHEMA.md](./DATA_SCHEMA.md#前端-typescript-类型建议) 给出。再补充通用响应：

```ts
export interface PageResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface DataResult<T> {
  data: T;
}

export interface ApiError {
  status: number;
  message: string;
  payload?: unknown;
}
```

后端返回字段大小写必须原样保留。例如 `BillDate`、`FlowDate`、`Flowtype`、`Relatedparty`。若前端想使用 camelCase，应只在统一的数据适配层转换。

## 联调验收清单

- 登录、错误密码、token 过期/服务重启后的跳转正确。
- 两类列表的筛选、分页、升降序和空结果正确。
- 新增后能在正确的日期、类型和分类筛选中出现。
- 修改不允许改原始日期；历史修改有二次确认。
- 删除后页码不会落到不存在的空页。
- 四组字典新增和重命名后，下拉框与已有流水同步刷新。
- summary 中普通净收入、外部现金流和期末现金没有混为一个数。
- 未偿款四种状态及 `danglingRelatedIds` 均有合理显示。
- 所有 nullable 百分比不会被格式化为 `0%` 或 `NaN%`。
- 数据质量页面按 `healthy` 而不是 HTTP 200 判断状态。
- 浏览器控制台、网络日志和源码中没有密码。

