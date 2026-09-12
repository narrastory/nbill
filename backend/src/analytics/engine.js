/**
 * Analytics Engine for NBill v3.0.
 *
 * Reads from in-memory store accessors and computes financial analytics.
 * Results are NOT persisted to disk.
 */

import {
  getTransactions,
  getExternalTransactions,
  getBillCategories,
  getBillTags,
  getExFlowType,
  getExRelatedParty,
} from '../store/engine.js';
import { getConfig } from '../config.js';
import { getLogger } from '../logger.js';
import { computeCashWindow, filterRecordsByRange, parseAnalyticsRange } from './range.js';
import {
  aggregateExternalByParty,
  buildExternalGroups,
  summarizeExternalGroups,
} from './externalGroups.js';

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Format a Date as YYYY-MM-DD string.
 */
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Add months to a Date.
 */
function addMonths(d, n) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

/**
 * Parse "YYYY-MM-DD" into a Date.
 */
function parseDate(s) {
  return new Date(s + 'T00:00:00');
}

/**
 * Get the date field from a transaction record (handles case variants).
 */
function txnDate(t) {
  return t.BillDate || t.billDate || '';
}

/**
 * Get the date field from an external transaction record.
 */
function extDate(t) {
  return t.FlowDate || t.flowDate || '';
}

/**
 * Get the Type field (handles case variants).
 */
function txnType(t) {
  return t.Type || t.type || '';
}

/**
 * Get the Amount field (handles case variants).
 */
function txnAmount(t) {
  const v = t.Amount ?? t.amount;
  return typeof v === 'number' ? v : parseFloat(v) || 0;
}

/**
 * Get the ID field (handles case variants).
 */
function txnId(t) {
  return t.ID ?? t.id;
}

/**
 * Clamp a value between min and max.
 */
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

/**
 * Compute percentile from sorted array using linear interpolation.
 * @param {number[]} sorted - Sorted ascending array
 * @param {number} p - Percentile (0-100)
 * @returns {number}
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const k = (p / 100) * (sorted.length - 1);
  const f = Math.floor(k);
  const c = Math.ceil(k);
  if (f === c) return sorted[f];
  return sorted[f] + (k - f) * (sorted[c] - sorted[f]);
}

// ─── Item 1: Basic Statistics ───────────────────────────────────────

function computeOverview(txns, extTxns, initialBalance, cashWindow) {
  const totalIncome = txns
    .filter((t) => txnType(t) === 'Income')
    .reduce((sum, t) => sum + txnAmount(t), 0);

  const totalExpense = txns
    .filter((t) => txnType(t) === 'Expense')
    .reduce((sum, t) => sum + txnAmount(t), 0);

  const externalIn = extTxns
    .filter((t) => txnType(t) === 'IN')
    .reduce((sum, t) => sum + txnAmount(t), 0);

  const externalOut = extTxns
    .filter((t) => txnType(t) === 'OUT')
    .reduce((sum, t) => sum + txnAmount(t), 0);

  const netIncome = totalIncome - totalExpense;
  const externalNetCashFlow = externalIn - externalOut;
  const round = (value) => Math.round(value * 100) / 100;

  return {
    totalIncome: round(totalIncome),
    totalExpense: round(totalExpense),
    netIncome: round(netIncome),
    netBalance: round(netIncome),
    initialBalance: round(initialBalance),
    openingCashBalance: cashWindow.openingCashBalance,
    externalIn: round(externalIn),
    externalOut: round(externalOut),
    externalNetCashFlow: round(externalNetCashFlow),
    closingCashBalance: cashWindow.closingCashBalance,
    currentCashBalance: cashWindow.closingCashBalance,
  };
}

function computeQuintiles(txns) {
  const incomeAmounts = txns
    .filter((t) => txnType(t) === 'Income')
    .map((t) => txnAmount(t))
    .sort((a, b) => a - b);

  const expenseAmounts = txns
    .filter((t) => txnType(t) === 'Expense')
    .map((t) => txnAmount(t))
    .sort((a, b) => a - b);

  const iAvg = incomeAmounts.length > 0
    ? Math.round(incomeAmounts.reduce((s, v) => s + v, 0) / incomeAmounts.length * 100) / 100
    : 0;
  const eAvg = expenseAmounts.length > 0
    ? Math.round(expenseAmounts.reduce((s, v) => s + v, 0) / expenseAmounts.length * 100) / 100
    : 0;

  const iBreakpoints = incomeAmounts.length > 0
    ? [20, 40, 60, 80].map((p) => Math.round(percentile(incomeAmounts, p) * 100) / 100)
    : [];
  const eBreakpoints = expenseAmounts.length > 0
    ? [20, 40, 60, 80].map((p) => Math.round(percentile(expenseAmounts, p) * 100) / 100)
    : [];

  return {
    income: { breakpoints: iBreakpoints, average: iAvg, count: incomeAmounts.length },
    expense: { breakpoints: eBreakpoints, average: eAvg, count: expenseAmounts.length },
  };
}

function computeExtremes(txns) {
  const incomeTxns = txns.filter((t) => txnType(t) === 'Income');
  const expenseTxns = txns.filter((t) => txnType(t) === 'Expense');

  let maxIncome = null;
  if (incomeTxns.length > 0) {
    const t = incomeTxns.reduce((a, b) => (txnAmount(a) > txnAmount(b) ? a : b));
    maxIncome = {
      amount: txnAmount(t),
      billDate: txnDate(t),
      category: t.Category || t.category || '',
      subcategory: t.Subcategory || t.subcategory || '',
      description: t.Description || t.description || '',
    };
  }

  let maxExpense = null;
  if (expenseTxns.length > 0) {
    const t = expenseTxns.reduce((a, b) => (txnAmount(a) > txnAmount(b) ? a : b));
    maxExpense = {
      amount: txnAmount(t),
      billDate: txnDate(t),
      category: t.Category || t.category || '',
      subcategory: t.Subcategory || t.subcategory || '',
      description: t.Description || t.description || '',
    };
  }

  return { maxIncome, maxExpense };
}

function computeMaxHistoricalCash(txns, extTxns, openingBalance) {
  // Dates have no time component, so calculate end-of-day balances instead
  // of inventing an intraday order from array positions.
  const dailyChanges = new Map();

  const addDailyChange = (date, changeCents, eventSource) => {
    if (!dailyChanges.has(date)) {
      dailyChanges.set(date, { changeCents: 0, hasTransaction: false, hasExternal: false });
    }
    const day = dailyChanges.get(date);
    day.changeCents += changeCents;
    if (eventSource === 'transaction') day.hasTransaction = true;
    if (eventSource === 'externalTransaction') day.hasExternal = true;
  };

  for (const t of txns) {
    const date = txnDate(t);
    if (!date) continue;
    const amountCents = Math.round(txnAmount(t) * 100);
    const changeCents = txnType(t) === 'Income' ? amountCents : -amountCents;
    addDailyChange(date, changeCents, 'transaction');
  }

  for (const t of extTxns) {
    const date = extDate(t);
    if (!date) continue;
    const amountCents = Math.round(txnAmount(t) * 100);
    const changeCents = txnType(t) === 'IN' ? amountCents : -amountCents;
    addDailyChange(date, changeCents, 'externalTransaction');
  }

  let runningCents = Math.round(openingBalance * 100);
  let maxBalanceCents = runningCents;
  let maxDate = null;
  let source = 'initialBalance';

  for (const [date, day] of [...dailyChanges.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    runningCents += day.changeCents;
    if (runningCents > maxBalanceCents) {
      maxBalanceCents = runningCents;
      maxDate = date;
      // The public response permits one source only. Prefer the ordinary
      // transaction source deterministically when both tables change that day.
      source = day.hasTransaction ? 'transaction' : 'externalTransaction';
    }
  }

  return {
    amount: maxBalanceCents / 100,
    date: maxDate,
    source,
  };
}

function computeRecordCounts(txns, extTxns, cats, tags, flowTypes, parties) {
  return {
    transactions: txns.length,
    externalTransactions: extTxns.length,
    billCategories: cats.length,
    billTags: tags.length,
    exFlowType: flowTypes.length,
    exRelatedParty: parties.length,
  };
}

// ─── Item 2: Cash Balance Trend ─────────────────────────────────────

function computeCashBalanceTrend(txns, extTxns, openingBalance, monthInterval, range) {
  const interval = clamp(monthInterval, 1, 12);

  // Collect all dated events
  const events = [];

  for (const t of txns) {
    const date = txnDate(t);
    if (!date) continue;
    const amount = txnAmount(t);
    events.push({ date: parseDate(date), change: txnType(t) === 'Income' ? amount : -amount });
  }

  for (const t of extTxns) {
    const date = extDate(t);
    if (!date) continue;
    const amount = txnAmount(t);
    events.push({ date: parseDate(date), change: txnType(t) === 'IN' ? amount : -amount });
  }

  if (events.length === 0) {
    return [{ date: range.dateTo, balance: openingBalance }];
  }

  events.sort((a, b) => a.date - b.date);

  // Build running balance per day
  const dailyBalance = new Map();
  for (const ev of events) {
    const key = fmtDate(ev.date);
    dailyBalance.set(key, (dailyBalance.get(key) || 0) + ev.change);
  }

  // Generate interval points
  const startDate = parseDate(range.dateFrom || fmtDate(events[0].date));
  const endDate = parseDate(range.dateTo);
  const result = [];

  let current = new Date(startDate);
  while (current <= endDate) {
    const pointKey = fmtDate(current);

    // Sum all changes up to this point
    let balance = openingBalance;
    for (const ev of events) {
      if (ev.date <= current) {
        balance += ev.change;
      }
    }

    result.push({
      date: pointKey,
      balance: Math.round(balance * 100) / 100,
    });

    current = addMonths(current, interval);
  }

  // Ensure the final result always includes the inclusive range end.
  if (result.length > 0 && result[result.length - 1].date !== range.dateTo) {
    let balance = openingBalance;
    for (const ev of events) {
      if (ev.date <= endDate) {
        balance += ev.change;
      }
    }
    result.push({
      date: range.dateTo,
      balance: Math.round(balance * 100) / 100,
    });
  }

  return result;
}

// ─── Item 3: Monthly Summary ────────────────────────────────────────

function computeMonthlySummary(txns, range) {
  // Group transactions by month
  const byMonth = new Map();

  for (const t of txns) {
    const date = txnDate(t);
    if (!date) continue;
    const yearMonth = date.substring(0, 7); // "YYYY-MM"
    if (!byMonth.has(yearMonth)) {
      byMonth.set(yearMonth, []);
    }
    byMonth.get(yearMonth).push(t);
  }

  // Determine earliest and latest month from data
  const months = Array.from(byMonth.keys()).sort();
  const earliest = range.dateFrom?.slice(0, 7) || months[0];
  if (!earliest) return [];
  const endYearMonth = range.dateTo.slice(0, 7);

  const allMonths = [];
  let [y, m] = earliest.split('-').map(Number);
  const [endY, endM] = endYearMonth.split('-').map(Number);

  while (y < endY || (y === endY && m <= endM)) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    allMonths.push(ym);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }

  // Compute each month
  return allMonths.map((ym) => {
    const monthTxns = byMonth.get(ym) || [];

    const incomeTxns = monthTxns.filter((t) => txnType(t) === 'Income');
    const expenseTxns = monthTxns.filter((t) => txnType(t) === 'Expense');

    const totalIncome = incomeTxns.reduce((s, t) => s + txnAmount(t), 0);
    const totalExpense = expenseTxns.reduce((s, t) => s + txnAmount(t), 0);

    const foodExpense = expenseTxns
      .filter((t) => (t.Category || t.category || '') === '餐饮食品')
      .reduce((s, t) => s + txnAmount(t), 0);

    const activeChoiceExpense = expenseTxns
      .filter((t) => {
        const tag = (t.Tag || t.tag || '');
        return tag.split(',').some((tg) => tg.trim() === '主动选择');
      })
      .reduce((s, t) => s + txnAmount(t), 0);

    const expenseCount = expenseTxns.length;
    const incomeCount = incomeTxns.length;
    const frequency = monthTxns.length;

    return {
      yearMonth: ym,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      netProfit: Math.round((totalIncome - totalExpense) * 100) / 100,
      frequency,
      expenseCount,
      incomeCount,
      foodExpense: Math.round(foodExpense * 100) / 100,
      nonFoodExpense: Math.round((totalExpense - foodExpense) * 100) / 100,
      activeChoiceExpense: Math.round(activeChoiceExpense * 100) / 100,
      avgPerExpense: expenseCount > 0 ? Math.round((totalExpense / expenseCount) * 100) / 100 : 0,
    };
  });
}

// ─── Item 4: Category Analysis ──────────────────────────────────────

function computeCategoryAnalysis(txns, recentMonths, endDate) {
  const windowEnd = parseDate(endDate);

  let startDate = null;
  let months = recentMonths;

  if (recentMonths > 0) {
    startDate = new Date(windowEnd);
    startDate.setDate(1); // First day of that month
    startDate.setMonth(startDate.getMonth() - (recentMonths - 1));
  }

  const filtered = startDate
    ? txns.filter((t) => {
        const d = txnDate(t);
        if (!d) return false;
        return parseDate(d) >= startDate;
      })
    : txns;

  const timeWindow = {
    months: recentMonths,
    startDate: startDate ? fmtDate(startDate) : null,
    endDate: fmtDate(windowEnd),
  };

  // By Category (一级)
  const catMap = new Map();
  for (const t of filtered) {
    const cat = t.Category || t.category || '';
    const type = txnType(t);
    const key = `${cat}|${type}`;
    if (!catMap.has(key)) {
      catMap.set(key, { name: cat, type, recordCount: 0, totalAmount: 0 });
    }
    const entry = catMap.get(key);
    entry.recordCount++;
    entry.totalAmount += txnAmount(t);
  }

  const byCategory = Array.from(catMap.values())
    .map((e) => ({
      ...e,
      totalAmount: Math.round(e.totalAmount * 100) / 100,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  // By Subcategory (二级)
  const subcatMap = new Map();
  for (const t of filtered) {
    const cat = t.Category || t.category || '';
    const subcat = t.Subcategory || t.subcategory || '';
    const type = txnType(t);
    const key = `${cat}|${subcat}|${type}`;
    if (!subcatMap.has(key)) {
      subcatMap.set(key, { name: subcat, parentCategory: cat, type, recordCount: 0, totalAmount: 0 });
    }
    const entry = subcatMap.get(key);
    entry.recordCount++;
    entry.totalAmount += txnAmount(t);
  }

  const bySubcategory = Array.from(subcatMap.values())
    .map((e) => ({
      ...e,
      totalAmount: Math.round(e.totalAmount * 100) / 100,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  return { timeWindow, byCategory, bySubcategory };
}

// ─── Item 5: Amount Distribution ────────────────────────────────────

function computeAmountDistribution(txns) {
  // Semi-logarithmic bucket edges
  const bucketEdges = [0, 1, 5, 10, 50, 100, 500, 1000, 5000, 10000, 50000, Infinity];

  function buildBuckets(amounts) {
    const buckets = [];
    for (let i = 0; i < bucketEdges.length - 1; i++) {
      const min = bucketEdges[i];
      const max = bucketEdges[i + 1];
      const count = amounts.filter((a) => a > min && a <= max).length;
      buckets.push({
        min,
        max: max === Infinity ? null : max,
        count,
      });
    }
    return buckets;
  }

  const incomeAmounts = txns
    .filter((t) => txnType(t) === 'Income')
    .map((t) => txnAmount(t));

  const expenseAmounts = txns
    .filter((t) => txnType(t) === 'Expense')
    .map((t) => txnAmount(t));

  return {
    income: buildBuckets(incomeAmounts),
    expense: buildBuckets(expenseAmounts),
  };
}

// ─── Item 6: External Transactions Analysis ─────────────────────────

function computeExternalAnalysis(periodExtTxns, asOfExtTxns, asOf) {
  const groups = buildExternalGroups(asOfExtTxns, { asOf });
  const totalIn = periodExtTxns
    .filter((record) => txnType(record) === 'IN')
    .reduce((sum, record) => sum + txnAmount(record), 0);
  const totalOut = periodExtTxns
    .filter((record) => txnType(record) === 'OUT')
    .reduce((sum, record) => sum + txnAmount(record), 0);
  const round = (value) => Math.round(value * 100) / 100;
  return {
    cashFlow: {
      totalIn: round(totalIn),
      totalOut: round(totalOut),
      netCashFlow: round(totalIn - totalOut),
    },
    outstanding: summarizeExternalGroups(groups),
    groups,
    byParty: aggregateExternalByParty(groups),
  };
}

// ─── Bonus Items ────────────────────────────────────────────────────

function computeSavingsRate(monthlySummary) {
  const byYear = new Map();
  for (const m of monthlySummary) {
    const year = m.yearMonth.substring(0, 4);
    if (!byYear.has(year)) {
      byYear.set(year, { totalIncome: 0, totalExpense: 0 });
    }
    const y = byYear.get(year);
    y.totalIncome += m.totalIncome;
    y.totalExpense += m.totalExpense;
  }

  return Array.from(byYear.entries())
    .map(([year, v]) => ({
      year: parseInt(year),
      totalIncome: Math.round(v.totalIncome * 100) / 100,
      totalExpense: Math.round(v.totalExpense * 100) / 100,
      savingsRate: v.totalIncome > 0
        ? Math.round(((v.totalIncome - v.totalExpense) / v.totalIncome) * 10000) / 100
        : null,
    }))
    .sort((a, b) => a.year - b.year);
}

function computeMonthlyTrends(monthlySummary, range) {
  if (monthlySummary.length === 0) return [];

  const isIncompleteMonth = (yearMonth) => {
    const [year, month] = yearMonth.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const beginsMidMonth = Boolean(
      range.dateFrom
      && yearMonth === range.dateFrom.slice(0, 7)
      && range.dateFrom.slice(8, 10) !== '01',
    );
    const endsMidMonth = yearMonth === range.dateTo.slice(0, 7)
      && Number(range.dateTo.slice(8, 10)) !== lastDay;
    return beginsMidMonth || endsMidMonth;
  };

  return monthlySummary.map((m, i) => {
    const [y, mo] = m.yearMonth.split('-').map(Number);
    const isIncomplete = isIncompleteMonth(m.yearMonth);
    const prev = i > 0 ? monthlySummary[i - 1] : null;
    // YoY: same month last year
    const lastYearKey = `${y - 1}-${String(mo).padStart(2, '0')}`;
    const lastYear = monthlySummary.find((x) => x.yearMonth === lastYearKey);

    return {
      yearMonth: m.yearMonth,
      expenseMoM: !isIncomplete && prev && !isIncompleteMonth(prev.yearMonth) && prev.totalExpense > 0
        ? Math.round(((m.totalExpense - prev.totalExpense) / prev.totalExpense) * 10000) / 100
        : null,
      incomeMoM: !isIncomplete && prev && !isIncompleteMonth(prev.yearMonth) && prev.totalIncome > 0
        ? Math.round(((m.totalIncome - prev.totalIncome) / prev.totalIncome) * 10000) / 100
        : null,
      expenseYoY: !isIncomplete && lastYear && !isIncompleteMonth(lastYear.yearMonth) && lastYear.totalExpense > 0
        ? Math.round(((m.totalExpense - lastYear.totalExpense) / lastYear.totalExpense) * 10000) / 100
        : null,
      incomeYoY: !isIncomplete && lastYear && !isIncompleteMonth(lastYear.yearMonth) && lastYear.totalIncome > 0
        ? Math.round(((m.totalIncome - lastYear.totalIncome) / lastYear.totalIncome) * 10000) / 100
        : null,
    };
  });
}

function computeDayOfWeekAnalysis(txns) {
  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const byDay = new Array(7).fill(null).map(() => ({ expenseCount: 0, expenseAmount: 0 }));

  for (const t of txns) {
    if (txnType(t) !== 'Expense') continue;
    const date = txnDate(t);
    if (!date) continue;
    const dow = parseDate(date).getDay();
    byDay[dow].expenseCount++;
    byDay[dow].expenseAmount += txnAmount(t);
  }

  return dayNames.map((name, i) => ({
    dayOfWeek: i,
    dayName: name,
    expenseCount: byDay[i].expenseCount,
    expenseAmount: Math.round(byDay[i].expenseAmount * 100) / 100,
    averageExpense: byDay[i].expenseCount > 0
      ? Math.round((byDay[i].expenseAmount / byDay[i].expenseCount) * 100) / 100
      : 0,
  }));
}

function computeParetoAnalysis(txns) {
  const expenseTxns = txns.filter((t) => txnType(t) === 'Expense');

  // By Subcategory
  const subcatMap = new Map();
  for (const t of expenseTxns) {
    const subcat = t.Subcategory || t.subcategory || '';
    const category = t.Category || t.category || '';
    const key = JSON.stringify([category, subcat]);
    if (!subcatMap.has(key)) {
      subcatMap.set(key, { subcategory: subcat, category, amount: 0 });
    }
    subcatMap.get(key).amount += txnAmount(t);
  }

  const sorted = Array.from(subcatMap.values())
    .sort((a, b) => b.amount - a.amount);

  const totalExpense = sorted.reduce((s, x) => s + x.amount, 0);

  let cumulative = 0;
  return sorted.map((item) => {
    const isCore = cumulative < totalExpense * 0.8;
    cumulative += item.amount;
    const percent = totalExpense > 0 ? (item.amount / totalExpense) * 100 : 0;
    const cumulativePercent = totalExpense > 0 ? (cumulative / totalExpense) * 100 : 0;
    return {
      subcategory: item.subcategory,
      category: item.category,
      amount: Math.round(item.amount * 100) / 100,
      percent: Math.round(percent * 100) / 100,
      cumulativePercent: Math.round(cumulativePercent * 100) / 100,
      isCore,
    };
  });
}

function computeTagAnalysis(txns, tags) {
  const tagNames = tags.map((t) => t.Tag || t.tag || '').filter(Boolean);

  return tagNames.map((tag) => {
    const matching = txns.filter((t) => {
      const tTag = t.Tag || t.tag || '';
      return tTag.split(',').some((tg) => tg.trim() === tag);
    });

    // By category
    const catMap = new Map();
    for (const t of matching) {
      const cat = t.Category || t.category || '';
      if (!catMap.has(cat)) {
        catMap.set(cat, { category: cat, count: 0, totalAmount: 0 });
      }
      const c = catMap.get(cat);
      c.count++;
      c.totalAmount += txnAmount(t);
    }

    const totalAmount = matching.reduce((s, t) => s + txnAmount(t), 0);

    return {
      tag,
      count: matching.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      byCategory: Array.from(catMap.values()).map((c) => ({
        ...c,
        totalAmount: Math.round(c.totalAmount * 100) / 100,
      })),
    };
  });
}

function computeFrequencyAmount(txns) {
  const subcatMap = new Map();

  for (const t of txns) {
    const type = txnType(t);
    const subcat = t.Subcategory || t.subcategory || '';
    const cat = t.Category || t.category || '';
    const key = JSON.stringify([cat, subcat, type]);
    if (!subcatMap.has(key)) {
      subcatMap.set(key, {
        subcategory: subcat,
        category: cat,
        type,
        frequency: 0,
        totalAmount: 0,
      });
    }
    const e = subcatMap.get(key);
    e.frequency++;
    e.totalAmount += txnAmount(t);
  }

  return Array.from(subcatMap.values())
    .map((e) => ({
      ...e,
      totalAmount: Math.round(e.totalAmount * 100) / 100,
      avgAmount: e.frequency > 0
        ? Math.round((e.totalAmount / e.frequency) * 100) / 100
        : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

function computeAnomalies(txns) {
  const expenseTxns = txns.filter((t) => txnType(t) === 'Expense');

  // Group by subcategory and month
  const subcatMonths = new Map();
  for (const t of expenseTxns) {
    const date = txnDate(t);
    if (!date) continue;
    const subcat = t.Subcategory || t.subcategory || '';
    const yearMonth = date.substring(0, 7);
    const key = `${subcat}|${yearMonth}`;
    if (!subcatMonths.has(key)) {
      subcatMonths.set(key, { subcategory: subcat, yearMonth, amount: 0 });
    }
    subcatMonths.get(key).amount += txnAmount(t);
  }

  // For each subcategory, compute mean and stddev
  const results = [];
  const subcatGroups = new Map();
  for (const entry of subcatMonths.values()) {
    if (!subcatGroups.has(entry.subcategory)) {
      subcatGroups.set(entry.subcategory, []);
    }
    subcatGroups.get(entry.subcategory).push(entry);
  }

  for (const [subcat, entries] of subcatGroups) {
    if (entries.length < 3) continue; // Need at least 3 months for meaningful stats

    const amounts = entries.map((e) => e.amount);
    const mean = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    const variance = amounts.reduce((s, v) => s + (v - mean) ** 2, 0) / amounts.length;
    const stddev = Math.sqrt(variance);
    const threshold = mean + 2 * stddev;

    for (const entry of entries) {
      if (entry.amount > threshold) {
        results.push({
          subcategory: subcat,
          yearMonth: entry.yearMonth,
          amount: Math.round(entry.amount * 100) / 100,
          mean: Math.round(mean * 100) / 100,
          stddev: Math.round(stddev * 100) / 100,
          threshold: Math.round(threshold * 100) / 100,
          excessPercent: Math.round(((entry.amount - mean) / mean) * 10000) / 100,
        });
      }
    }
  }

  return results.sort((a, b) => b.excessPercent - a.excessPercent);
}

function computeTopRecords(txns) {
  const byYear = new Map();
  for (const t of txns) {
    const date = txnDate(t);
    if (!date) continue;
    const year = date.substring(0, 4);
    if (!byYear.has(year)) {
      byYear.set(year, []);
    }
    byYear.get(year).push(t);
  }

  const result = [];
  for (const [year, records] of byYear) {
    const expenses = records
      .filter((t) => txnType(t) === 'Expense')
      .sort((a, b) => txnAmount(b) - txnAmount(a))
      .slice(0, 5)
      .map((t) => ({
        id: txnId(t),
        amount: txnAmount(t),
        billDate: txnDate(t),
        category: t.Category || t.category || '',
        subcategory: t.Subcategory || t.subcategory || '',
        description: t.Description || t.description || '',
      }));

    const incomes = records
      .filter((t) => txnType(t) === 'Income')
      .sort((a, b) => txnAmount(b) - txnAmount(a))
      .slice(0, 5)
      .map((t) => ({
        id: txnId(t),
        amount: txnAmount(t),
        billDate: txnDate(t),
        category: t.Category || t.category || '',
        subcategory: t.Subcategory || t.subcategory || '',
        description: t.Description || t.description || '',
      }));

    result.push({ year: parseInt(year), topExpenses: expenses, topIncomes: incomes });
  }

  return result.sort((a, b) => a.year - b.year);
}

// ─── Main Entry Point ───────────────────────────────────────────────

/**
 * Compute all analytics from live in-memory data.
 * Results are computed fresh from the in-memory store on each call.
 *
 * @returns {object} Full analytics result
 */
export function computeAnalytics(options = {}) {
  const logger = getLogger();
  const config = getConfig();

  // Read live data
  const txns = getTransactions();
  const extTxns = getExternalTransactions();
  const categories = getBillCategories();
  const tags = getBillTags();
  const flowTypes = getExFlowType();
  const parties = getExRelatedParty();

  const initialBalance = config.business.initialBalance;
  const monthInterval = clamp(config.analytics?.monthInterval ?? 3, 1, 12);
  const recentMonths = Math.max(0, config.analytics?.recentMonths ?? 12);
  const range = options.range || parseAnalyticsRange({}, options.now);
  const periodTxns = filterRecordsByRange(txns, txnDate, range);
  const periodExtTxns = filterRecordsByRange(extTxns, extDate, range);
  const asOfExtTxns = extTxns.filter((record) => extDate(record) <= range.dateTo);
  const cashWindow = computeCashWindow({
    transactions: txns,
    externalTransactions: extTxns,
    initialBalance,
    range,
  });

  logger.info(`Computing analytics: ${txns.length} txns, ${extTxns.length} ext txns`);

  // ── Item 1: Basic Statistics ──
  const overview = computeOverview(periodTxns, periodExtTxns, initialBalance, cashWindow);
  const quintiles = computeQuintiles(periodTxns);
  const extremes = computeExtremes(periodTxns);
  const maxHistoricalCash = computeMaxHistoricalCash(
    periodTxns,
    periodExtTxns,
    cashWindow.openingCashBalance,
  );
  const recordCounts = computeRecordCounts(txns, extTxns, categories, tags, flowTypes, parties);

  // ── Item 2: Cash Balance Trend ──
  const cashBalanceTrend = computeCashBalanceTrend(
    periodTxns,
    periodExtTxns,
    cashWindow.openingCashBalance,
    monthInterval,
    range,
  );

  // ── Item 3: Monthly Summary ──
  const monthlySummary = computeMonthlySummary(periodTxns, range);

  // ── Item 4: Category Analysis ──
  const categoryAnalysis = computeCategoryAnalysis(
    periodTxns,
    range.dateFrom ? 0 : recentMonths,
    range.dateTo,
  );

  // ── Item 5: Amount Distribution ──
  const amountDistribution = computeAmountDistribution(periodTxns);

  // ── Item 6: External Analysis ──
  const externalAnalysis = computeExternalAnalysis(periodExtTxns, asOfExtTxns, range.dateTo);

  // ── Bonus Items ──
  const savingsRate = computeSavingsRate(monthlySummary);
  const monthlyTrends = computeMonthlyTrends(monthlySummary, range);
  const dayOfWeek = computeDayOfWeekAnalysis(periodTxns);
  const pareto = computeParetoAnalysis(periodTxns);
  const tagAnalysis = computeTagAnalysis(periodTxns, tags);
  const frequencyAmount = computeFrequencyAmount(periodTxns);
  const anomalies = computeAnomalies(periodTxns);
  const topRecords = computeTopRecords(periodTxns);

  // Assemble result
  const result = {
    computedAt: new Date().toISOString(),
    period: range,
    basicStats: {
      overview,
      quintiles,
      extremes,
      maxHistoricalCash,
      recordCounts,
    },
    cashBalanceTrend,
    monthlySummary,
    categoryAnalysis,
    amountDistribution,
    externalAnalysis,
    bonus: {
      savingsRate,
      monthlyTrends,
      dayOfWeek,
      pareto,
      tagAnalysis,
      frequencyAmount,
      anomalies,
      topRecords,
    },
  };

  logger.info('Analytics computation complete');
  return result;
}

function shiftDate(dateString, days) {
  const date = parseDate(dateString);
  date.setDate(date.getDate() + days);
  return fmtDate(date);
}

function percentChange(current, previous) {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 10000) / 100;
}

export function computeAnalyticsSummary({ range, now } = {}) {
  const effectiveRange = range || parseAnalyticsRange({}, now);
  const current = computeAnalytics({ range: effectiveRange, now });
  const overview = current.basicStats.overview;
  let comparison = {
    period: null,
    incomePercent: null,
    expensePercent: null,
    netIncomePercent: null,
  };

  if (effectiveRange.dateFrom) {
    const days = Math.round(
      (parseDate(effectiveRange.dateTo).getTime() - parseDate(effectiveRange.dateFrom).getTime()) / 86400000,
    ) + 1;
    const previousRange = {
      dateFrom: shiftDate(effectiveRange.dateFrom, -days),
      dateTo: shiftDate(effectiveRange.dateFrom, -1),
    };
    const previous = computeAnalytics({ range: previousRange, now }).basicStats.overview;
    comparison = {
      period: previousRange,
      incomePercent: percentChange(overview.totalIncome, previous.totalIncome),
      expensePercent: percentChange(overview.totalExpense, previous.totalExpense),
      netIncomePercent: percentChange(overview.netIncome, previous.netIncome),
    };
  }

  const summaryCategories = computeCategoryAnalysis(
    filterRecordsByRange(getTransactions(), txnDate, effectiveRange),
    0,
    effectiveRange.dateTo,
  );
  const expenseCategories = summaryCategories.byCategory
    .filter((item) => item.type === 'Expense')
    .slice(0, 5)
    .map((item) => ({
      category: item.name,
      amount: item.totalAmount,
      percent: overview.totalExpense > 0
        ? Math.round((item.totalAmount / overview.totalExpense) * 10000) / 100
        : 0,
    }));

  return {
    period: effectiveRange,
    cash: {
      openingCashBalance: overview.openingCashBalance,
      closingCashBalance: overview.closingCashBalance,
      periodCashChange: Math.round(
        (overview.closingCashBalance - overview.openingCashBalance) * 100,
      ) / 100,
    },
    operating: {
      totalIncome: overview.totalIncome,
      totalExpense: overview.totalExpense,
      netIncome: overview.netIncome,
      savingsRate: overview.totalIncome > 0
        ? Math.round((overview.netIncome / overview.totalIncome) * 10000) / 100
        : null,
    },
    external: {
      totalIn: overview.externalIn,
      totalOut: overview.externalOut,
      netCashFlow: overview.externalNetCashFlow,
      outstandingAmount: current.externalAnalysis.outstanding.totalOutstanding,
    },
    comparison,
    topExpenseCategories: expenseCategories,
  };
}

export function computeExternalOutstanding({ asOf, relatedParty, status } = {}) {
  const groups = buildExternalGroups(getExternalTransactions(), { asOf });
  const filtered = groups.filter((group) => (
    (!status || group.status === status)
    && (!relatedParty || group.parties.includes(relatedParty))
  ));
  return {
    asOf,
    filters: {
      relatedParty: relatedParty || null,
      status: status || null,
    },
    summary: summarizeExternalGroups(filtered),
    groups: filtered,
    byParty: aggregateExternalByParty(filtered),
  };
}

export default { computeAnalytics, computeAnalyticsSummary, computeExternalOutstanding };
