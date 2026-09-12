import { describe, expect, it } from 'vitest'

import {
  formatAmount,
  formatAmountBucket,
  formatCompactMoney,
  formatCount,
  formatMoney,
  formatNullablePercent,
  formatSignedPercent,
  formatText,
  parseIds,
  parseTags,
  serializeIds,
  serializeTags,
} from './format'

/**
 * 格式化的核心约束（手册反复强调、验收清单里是**否决项**）：
 * 所有 nullable 的金额与百分比都**不能**渲染成
 * `NaN` / `undefined` / `null`；同时 `null` 又**不能**与 `0` 混为一谈。
 *
 * 因此这里成对地测：null → `--`，而 0 → `0.00%`。
 */
describe('format · 空值兜底（null / undefined / NaN / Infinity）', () => {
  it.each([null, undefined, NaN, Infinity, -Infinity])('formatMoney(%s) → --', (value) => {
    expect(formatMoney(value)).toBe('--')
  })

  it.each([null, undefined, NaN, Infinity])('formatAmount(%s) → --', (value) => {
    expect(formatAmount(value)).toBe('--')
  })

  it.each([null, undefined, NaN])('formatCompactMoney(%s) → --', (value) => {
    expect(formatCompactMoney(value)).toBe('--')
  })

  it.each([null, undefined, NaN])('formatNullablePercent(%s) → --', (value) => {
    expect(formatNullablePercent(value)).toBe('--')
  })

  it('计数类没有"无数据"语义，非有限值回退为 0 而不是 --', () => {
    expect(formatCount(null)).toBe('0')
    expect(formatCount(NaN)).toBe('0')
  })
})

describe('format · null 与 0 必须区分开', () => {
  it('null 显示 --，0 显示 0.00%', () => {
    // 这两行是同一件事的两面：基数为 0 时后端返回 null，
    // 表示"无法计算"，与"确实为 0%"是完全不同的含义。
    expect(formatNullablePercent(null)).toBe('--')
    expect(formatNullablePercent(0)).toBe('0.00%')
  })

  it('null 显示 --，0 显示 ¥0.00', () => {
    expect(formatMoney(null)).toBe('--')
    expect(formatMoney(0)).toBe('¥0.00')
  })

  it('formatSignedPercent 保留正负号，null 仍为 --', () => {
    expect(formatSignedPercent(12.5)).toBe('+12.50%')
    expect(formatSignedPercent(-3.2)).toBe('-3.20%')
    expect(formatSignedPercent(0)).toBe('0.00%')
    expect(formatSignedPercent(null)).toBe('--')
  })
})

describe('format · 数值展示', () => {
  it('金额带货币符号与千分位', () => {
    expect(formatMoney(334057.39)).toBe('¥334,057.39')
  })

  it('紧凑金额在万以上换算为"万"', () => {
    expect(formatCompactMoney(335926.39)).toBe('33.6万')
    expect(formatCompactMoney(9999)).toBe('9,999')
  })

  it('百分比按指定位数四舍五入', () => {
    expect(formatNullablePercent(33.333)).toBe('33.33%')
    expect(formatNullablePercent(33.333, 1)).toBe('33.3%')
  })

  it('文本空值统一显示占位符', () => {
    expect(formatText('')).toBe('--')
    expect(formatText('   ')).toBe('--')
    expect(formatText(null)).toBe('--')
    expect(formatText('午餐')).toBe('午餐')
  })
})

describe('format · 金额分布区间（(min, max]，max 为 null 表示无穷大）', () => {
  it('有限上界显示为区间', () => {
    expect(formatAmountBucket(100, 500)).toBe('100 ~ 500')
  })

  it('max 为 null 时显示"高于下限"，而不是 null 或 undefined', () => {
    const text = formatAmountBucket(50000, null)
    expect(text).toBe('高于 5.0万')
    expect(text).not.toContain('null')
    expect(text).not.toContain('undefined')
  })
})

describe('format · 标签与关联 ID 的序列化', () => {
  it('标签用英文逗号分隔，过滤空白项', () => {
    expect(parseTags('')).toEqual([])
    expect(parseTags(null)).toEqual([])
    expect(parseTags('工作日,餐饮')).toEqual(['工作日', '餐饮'])
    expect(parseTags('a, ,b')).toEqual(['a', 'b'])
  })

  it('标签序列化去重', () => {
    expect(serializeTags(['a', 'b', 'a'])).toBe('a,b')
    expect(serializeTags([])).toBe('')
  })

  it('关联 ID 只保留正整数', () => {
    // 后端要求"只使用以英文逗号分隔的正整数 ID"，
    // 0、负数与非法字符串都必须被丢掉而不是原样提交
    expect(parseIds('21,25,0,-3,abc')).toEqual([21, 25])
    expect(parseIds('')).toEqual([])
    expect(parseIds(null)).toEqual([])
  })

  it('关联 ID 序列化去重并升序', () => {
    expect(serializeIds([25, 21, 25])).toBe('21,25')
    expect(serializeIds([])).toBe('')
  })
})
