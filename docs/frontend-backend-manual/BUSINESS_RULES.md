# 业务逻辑说明

## 1. 三套金额必须分开理解

### 普通经营收支

来自 `Transactions`：

```text
totalIncome  = 范围内 Type=Income 的 Amount 合计
totalExpense = 范围内 Type=Expense 的 Amount 合计
netIncome    = totalIncome - totalExpense
```

`netBalance` 是 `netIncome` 的兼容别名。前端新代码优先使用 `netIncome`。

### 外部现金往来

来自 `ExternalTransactions`：

```text
externalIn          = 范围内 Type=IN 的 Amount 合计
externalOut         = 范围内 Type=OUT 的 Amount 合计
externalNetCashFlow = externalIn - externalOut
```

外部现金往来不计入普通收入和普通支出。例如借给朋友 500 元会减少现金，但不是消费；朋友归还 500 元会增加现金，但不是收入。

### 现金余额

```text
openingCashBalance = 初始余额 + 查询开始日前全部普通及外部现金变动
closingCashBalance = openingCashBalance + netIncome + externalNetCashFlow
```

`currentCashBalance` 是 `closingCashBalance` 的兼容别名。初始余额 `initialBalance` 单独列示，绝不能加进 `totalIncome`。

## 2. 日期范围

分析接口使用 `dateFrom` 和 `dateTo`：

- 都是 `YYYY-MM-DD`。
- 起止日均包含在范围内。
- `dateTo` 省略时为后端本地日期的今天。
- `dateFrom` 省略时表示从最早数据开始。
- `dateTo` 不能是未来日期。
- `dateFrom` 不能晚于 `dateTo`。
- 查询范围前的流水不进入范围收入/支出，但会进入期初现金。

列表接口也支持同名日期参数，但当前列表筛选只是字符串闭区间比较；前端仍必须保证日期格式正确。

## 3. 编辑窗口与历史纠错

当前配置的普通编辑窗口为 45 天。后端按原记录的 `BillDate` 或 `FlowDate` 判断是否可编辑。

- 窗口内：PUT 正常执行，不额外备份。
- 窗口外：普通 PUT 返回 `403`。
- 用户明确确认后：PUT 追加 `?confirmHistoricalEdit=true`。
- 后端先保存当前内存数据，再创建完整备份，备份成功后才执行字段校验和更新。
- 参数必须精确为小写 `true`。
- `BillDate`、`FlowDate` 即使历史确认后也不能通过 PUT 修改。
- 历史删除始终禁止；DELETE 没有确认绕过机制。

正确的前端交互：

```text
第一次 PUT → 403 outside editable window
        ↓
弹窗解释会创建备份，显示“确认纠错”
        ↓ 用户主动确认
第二次 PUT，追加 confirmHistoricalEdit=true
```

前端不能在收到 403 后自动补参数重试。

## 4. 字典约束与级联更新

普通流水创建/更新前：

- Category + Subcategory 必须存在。
- Tag 中每个英文逗号分隔标签必须存在。

外部往来创建/更新前：

- FlowType 必须存在。
- RelatedParty 必须存在。
- RelatedID 中每个可解析 ID 必须对应已有的其他外部往来记录。

四类字典均不提供 DELETE。重命名会级联已有流水，因此前端更新成功后应同时失效：

- 对应字典缓存；
- 普通流水列表或外部往来列表缓存；
- 分析结果缓存。

## 5. 往来关联组与未偿金额

`RelatedID` 不是简单的父子关系。分析模块把每个 ID 当作节点，把 RelatedID 当作边，并按无向连通分量组成一个往来组。

示例：

```text
ID 7: OUT 300, RelatedID=""
ID 8: OUT 200, RelatedID=""
ID 9: IN  350, RelatedID="7,8"

组成员       = [7, 8, 9]
totalOut      = 500
totalIn       = 350
outstanding   = 150
status        = open
```

计算公式：

```text
outstandingAmount = max(totalOut - totalIn, 0)
overpaidAmount    = max(totalIn - totalOut, 0)
```

状态：

| status | 条件 | 前端含义 |
| --- | --- | --- |
| `open` | OUT > IN | 尚有未偿金额 |
| `settled` | OUT = IN 且存在 OUT | 已结清 |
| `overpaid` | IN > OUT 且存在 OUT | 回款/流入超过流出 |
| `unmatched-in` | 组内没有 OUT，只有 IN | 无匹配流入，需要检查 |

其他规则：

- `groupId` 是组内最小 ID，仅用于稳定标识，不是独立表字段。
- `ageDays` 只对 open 组计算，从最早 OUT 日期到 `asOf`。
- `danglingRelatedIds` 表示数据中引用了不存在的 ID。
- 一个组包含多个往来方时，`groups[].parties` 会全部列出；按往来方汇总时归入 `Multiple`，避免重复计算。
- `asOf` 之后的外部往来不会进入该时点的关联组。

## 6. 月度与高级统计

### 月汇总

每个月返回：

- `totalIncome`、`totalExpense`、`netProfit`
- `frequency`：收入和支出总笔数
- `expenseCount`、`incomeCount`
- `foodExpense`：一级分类精确等于“餐饮食品”的支出
- `nonFoodExpense = totalExpense - foodExpense`
- `activeChoiceExpense`：标签中包含“主动选择”的支出
- `avgPerExpense = totalExpense / expenseCount`，无支出时为 0

### 储蓄率

```text
savingsRate = (totalIncome - totalExpense) / totalIncome × 100
```

某年收入为 0 时返回 `null`。

### 环比和同比

- 环比：与数组中上一个月比较。
- 同比：与上年同月比较。
- 作为分母的历史值为 0 或不存在时返回 `null`。

### 星期消费

只统计 Expense，不统计 Income。`dayOfWeek` 为 0 至 6，对应周日至周六。

### Pareto

按支出二级分类降序累计；`isCore=true` 包含使累计比例首次跨过 80% 的那一项。

### 异常消费

按二级分类和月份汇总。某分类至少有 3 个月数据才参与；高于 `均值 + 2 × 标准差` 的月份被列为异常。

## 7. 数据质量报告

数据质量接口只读，不自动修改数据。`healthy` 只由 error 数量决定；存在 warning 但无 error 时仍可能为 true。

| code | 含义 |
| --- | --- |
| `INVALID_ID` | ID 不是正整数 |
| `DUPLICATE_ID` | 同表重复 ID |
| `INVALID_DATE` | 日期不是有效日历日期 |
| `INVALID_AMOUNT` | 金额不是正数 |
| `INVALID_TYPE` | Type 枚举无效 |
| `UNKNOWN_CATEGORY` | 分类组合不存在 |
| `UNKNOWN_TAG` | 标签不存在 |
| `UNKNOWN_FLOW_TYPE` | 往来类型不存在 |
| `UNKNOWN_RELATED_PARTY` | 往来方不存在 |
| `DANGLING_RELATED_ID` | RelatedID 指向不存在记录 |
| `COUNTER_BEHIND` | ID 计数器落后于实际最大 ID，级别为 warning |

建议把该页面定位为“诊断信息”，不要提供前端自动修复按钮。

