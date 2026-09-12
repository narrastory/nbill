/**
 * 分析接口类型。字段已用 /api/analytics、/api/analytics/summary、
 * /api/analytics/external-outstanding、/api/analytics/data-quality 的真实响应核对。
 *
 * ⚠️ 所有百分比类字段都可能为 `null`（分母为 0 或不存在基期）。
 * 展示层必须渲染为 `--` / "无可比基数"，绝不能显示 `0%`、`NaN%` 或 `undefined%`。
 * 详见 utils/format.ts 的 formatNullablePercent。
 */

import type { TransactionType } from './models'

/** 分析类接口共用的日期区间；`dateFrom` 省略时表示从最早数据开始。 */
export interface AnalyticsPeriodRange {
  dateFrom: string | null
  dateTo: string
}

/* -------------------------------------------------------------------------- */
/* GET /analytics/summary                                                     */
/* -------------------------------------------------------------------------- */

export interface SummaryResponse {
  period: AnalyticsPeriodRange
  cash: {
    openingCashBalance: number
    closingCashBalance: number
    periodCashChange: number
  }
  operating: {
    totalIncome: number
    totalExpense: number
    netIncome: number
    /** 分母（收入）为 0 时为 null。 */
    savingsRate: number | null
  }
  external: {
    totalIn: number
    totalOut: number
    netCashFlow: number
    outstandingAmount: number
  }
  comparison: {
    /** 未提供 dateFrom 时为 null，此时三个百分比均为 null。 */
    period: AnalyticsPeriodRange | null
    incomePercent: number | null
    expensePercent: number | null
    netIncomePercent: number | null
  }
  topExpenseCategories: Array<{
    category: string
    amount: number
    /** 占期间总支出的比例。 */
    percent: number
  }>
}

/* -------------------------------------------------------------------------- */
/* GET /analytics/external-outstanding                                        */
/* -------------------------------------------------------------------------- */

export type OutstandingStatus = 'open' | 'settled' | 'overpaid' | 'unmatched-in'

export interface OutstandingGroup {
  /** 组内最小 ID，仅用于稳定标识。 */
  groupId: number
  transactionIds: number[]
  /** 一个组可能包含多个往来方；按往来方汇总时会被归入 Multiple。 */
  parties: string[]
  earliestOutDate: string | null
  totalOut: number
  totalIn: number
  outstandingAmount: number
  overpaidAmount: number
  status: OutstandingStatus
  /**
   * 账龄（自然日）。后端**始终返回 number**（实测：非 open 组一律为 0），
   * 不是 `null`。因此"该不该显示账龄"必须按 `status === 'open'` 判断 ——
   * 用 `ageDays !== null` 会让每个已结清/超额/无匹配组都显示"账龄 0 天"。
   * 也不能用 `ageDays > 0`：查询截止日与流出日相同时，合法账龄就是 0 天。
   */
  ageDays: number
  /** 非空表示引用了不存在的 ID，UI 应显示数据异常提示。 */
  danglingRelatedIds: number[]
}

export interface OutstandingResponse {
  asOf: string
  filters: {
    relatedParty: string | null
    status: OutstandingStatus | null
  }
  summary: {
    totalGroups: number
    openGroups: number
    settledGroups: number
    overpaidGroups: number
    unmatchedInGroups: number
    totalOutstanding: number
    totalOverpaid: number
  }
  groups: OutstandingGroup[]
  /** 只汇总未结清组。 */
  byParty: Array<{
    party: string
    openGroups: number
    oldestAgeDays: number
    outstandingAmount: number
  }>
}

/* -------------------------------------------------------------------------- */
/* GET /analytics/data-quality                                                */
/* -------------------------------------------------------------------------- */

export type DataQualitySeverity = 'error' | 'warning'

export type DataQualityCode =
  | 'INVALID_ID'
  | 'DUPLICATE_ID'
  | 'INVALID_DATE'
  | 'INVALID_AMOUNT'
  | 'INVALID_TYPE'
  | 'UNKNOWN_CATEGORY'
  | 'UNKNOWN_TAG'
  | 'UNKNOWN_FLOW_TYPE'
  | 'UNKNOWN_RELATED_PARTY'
  | 'DANGLING_RELATED_ID'
  | 'COUNTER_BEHIND'

export interface DataQualityIssue {
  severity: DataQualitySeverity
  code: DataQualityCode
  table: string
  index: number
  id: number | null
  message: string
}

export interface DataQualityResponse {
  /** ⚠️ 必须以此字段判断健康状态；发现问题时 HTTP 仍然是 200。 */
  healthy: boolean
  checkedAt: string
  summary: { error: number; warning: number; total: number }
  issues: DataQualityIssue[]
}

/* -------------------------------------------------------------------------- */
/* GET /analytics （完整分析，实时计算，按需加载）                              */
/* -------------------------------------------------------------------------- */

export interface AnalyticsRecord {
  amount: number
  billDate: string
  category: string
  subcategory: string
  description: string
}

export interface TopRecord extends AnalyticsRecord {
  id: number
}

export interface MonthlySummary {
  yearMonth: string
  totalIncome: number
  totalExpense: number
  netProfit: number
  /** 收入与支出总笔数。 */
  frequency: number
  expenseCount: number
  incomeCount: number
  /** 一级分类精确等于"餐饮食品"的支出。 */
  foodExpense: number
  nonFoodExpense: number
  /** 标签中包含"主动选择"的支出。 */
  activeChoiceExpense: number
  /** 无支出时为 0。 */
  avgPerExpense: number
}

export interface CategoryAnalysis {
  timeWindow: { months: number; startDate: string | null; endDate: string }
  byCategory: Array<{
    name: string
    type: TransactionType
    recordCount: number
    totalAmount: number
  }>
  bySubcategory: Array<{
    name: string
    parentCategory: string
    type: TransactionType
    recordCount: number
    totalAmount: number
  }>
}

/** 区间规则为 `(min, max]`；`max: null` 表示无穷大，应展示为"高于 min"。 */
export interface AmountBucket {
  min: number
  max: number | null
  count: number
}

export interface AmountDistribution {
  income: AmountBucket[]
  expense: AmountBucket[]
}

export interface CashBalancePoint {
  date: string
  balance: number
}

export interface MonthlyTrend {
  yearMonth: string
  /**
   * 四个百分比都可能为 null。后端要求当前月与对比月都是**完整自然月**，
   * 因此 null 有三类原因，而前端无法只凭该字段区分是哪一类：
   *  1. 对比月份不存在；
   *  2. 对比月份的分母为 0；
   *  3. 当前月或对比月不是完整自然月。
   *
   * 展示时统一写成"不可比较（月份不完整、缺少对比期或基数为 0）"，
   * 绝不可补 0 —— 补 0 会伪造出"持平"的假趋势。
   */
  expenseMoM: number | null
  incomeMoM: number | null
  expenseYoY: number | null
  incomeYoY: number | null
}

export interface DayOfWeekStat {
  /** 0 = 周日 … 6 = 周六。只统计 Expense。 */
  dayOfWeek: number
  dayName: string
  expenseCount: number
  expenseAmount: number
  averageExpense: number
}

export interface ParetoItem {
  subcategory: string
  category: string
  amount: number
  percent: number
  cumulativePercent: number
  /** 包含使累计比例首次跨过 80% 的那一项。 */
  isCore: boolean
}

export interface TagAnalysisItem {
  tag: string
  count: number
  totalAmount: number
  byCategory: Array<{ category: string; count: number; totalAmount: number }>
}

export interface FrequencyAmountItem {
  subcategory: string
  category: string
  type: TransactionType
  frequency: number
  totalAmount: number
  avgAmount: number
}

export interface AnomalyItem {
  subcategory: string
  yearMonth: string
  amount: number
  mean: number
  stddev: number
  /** 均值 + 2 × 标准差。 */
  threshold: number
  excessPercent: number
}

/** 按年提供，实际返回为数组（每项含 year），不是以年份为键的对象。 */
export interface TopRecordsByYear {
  year: number
  topExpenses: TopRecord[]
  topIncomes: TopRecord[]
}

export interface FullAnalytics {
  computedAt: string
  period: AnalyticsPeriodRange
  basicStats: {
    overview: {
      totalIncome: number
      totalExpense: number
      netIncome: number
      /** netIncome 的兼容别名，新代码优先用 netIncome。 */
      netBalance: number
      /** 初始余额单独列示，绝不能加进 totalIncome。 */
      initialBalance: number
      openingCashBalance: number
      externalIn: number
      externalOut: number
      externalNetCashFlow: number
      closingCashBalance: number
      /** closingCashBalance 的兼容别名。 */
      currentCashBalance: number
    }
    quintiles: {
      income: { breakpoints: number[]; average: number; count: number }
      expense: { breakpoints: number[]; average: number; count: number }
    }
    extremes: {
      maxIncome: AnalyticsRecord | null
      maxExpense: AnalyticsRecord | null
    }
    maxHistoricalCash: {
      amount: number
      date: string | null
      source: 'initialBalance' | 'transaction' | 'externalTransaction'
    }
    recordCounts: Record<string, number>
  }
  cashBalanceTrend: CashBalancePoint[]
  monthlySummary: MonthlySummary[]
  categoryAnalysis: CategoryAnalysis
  amountDistribution: AmountDistribution
  externalAnalysis: {
    cashFlow: { totalIn: number; totalOut: number; netCashFlow: number }
    outstanding: OutstandingResponse['summary']
    groups: OutstandingGroup[]
    byParty: OutstandingResponse['byParty']
  }
  bonus: {
    /** 某年收入为 0 时 savingsRate 为 null。 */
    savingsRate: Array<{
      year: number
      totalIncome: number
      totalExpense: number
      savingsRate: number | null
    }>
    monthlyTrends: MonthlyTrend[]
    dayOfWeek: DayOfWeekStat[]
    pareto: ParetoItem[]
    tagAnalysis: TagAnalysisItem[]
    frequencyAmount: FrequencyAmountItem[]
    anomalies: AnomalyItem[]
    topRecords: TopRecordsByYear[]
  }
}
