import { describe, expect, it } from 'vitest'

import {
  LOG_FLOOR,
  NO_DATA_TEXT,
  createTooltipFormatter,
  escapeHtml,
  hasRenderableValues,
  isLogRenderable,
  toLogSafeData,
  toLogValue,
} from './chart'
import { formatCount, formatMoney, formatNullablePercent } from './format'

/**
 * 对数轴与 tooltip 的数值安全。
 *
 * 这两块此前只在 Playwright 里肉眼验过（截图 + 读页面文本），
 * 没有单元覆盖。但它们恰恰是需求里最硬的两条约束：
 * 对数轴不能出现 NaN / Infinity，tooltip 空值必须显示「无」。
 */
describe('chart · 对数轴可表示性', () => {
  it('只有有限正数能上对数轴', () => {
    expect(isLogRenderable(1)).toBe(true)
    expect(isLogRenderable(0.01)).toBe(true)
    expect(isLogRenderable(335926.39)).toBe(true)

    // 以下都不可表示 —— 对数轴遇到它们会算出 NaN 刻度
    expect(isLogRenderable(0)).toBe(false)
    expect(isLogRenderable(-1)).toBe(false)
    expect(isLogRenderable(-0.001)).toBe(false)
    expect(isLogRenderable(NaN)).toBe(false)
    expect(isLogRenderable(Infinity)).toBe(false)
    expect(isLogRenderable(-Infinity)).toBe(false)
    expect(isLogRenderable(null)).toBe(false)
    expect(isLogRenderable(undefined)).toBe(false)
  })

  it('toLogValue 把不可表示的值降级为 null，而不是钳成伪造的小正数', () => {
    // 关键：0 必须变成"断开"，不能变成 0.01 ——
    // 那会把"余额为 0"显示成一个非零值，属于篡改数据
    expect(toLogValue(0)).toBeNull()
    expect(toLogValue(-500)).toBeNull()
    expect(toLogValue(NaN)).toBeNull()
    expect(toLogValue(Infinity)).toBeNull()
  })

  it('极小正数抬到地板值，避免刻度塌陷', () => {
    expect(toLogValue(LOG_FLOOR)).toBe(LOG_FLOOR)
    expect(toLogValue(0.0001)).toBe(LOG_FLOOR)
    expect(toLogValue(1000)).toBe(1000)
  })

  it('toLogSafeData 保持数组长度不变并回报被丢弃的下标', () => {
    const { data, omittedIndexes } = toLogSafeData([100, 0, -5, 200, NaN])
    expect(data).toHaveLength(5)
    expect(data[0]).toBe(100)
    expect(data[1]).toBeNull()
    expect(data[2]).toBeNull()
    expect(data[3]).toBe(200)
    expect(data[4]).toBeNull()
    expect(omittedIndexes).toEqual([1, 2, 4])
  })

  it('全零数据不会产出可上轴的值', () => {
    expect(hasRenderableValues([0, 0, 0])).toBe(false)
    expect(hasRenderableValues([0, 12])).toBe(true)
    expect(hasRenderableValues([])).toBe(false)
  })
})

describe('chart · tooltip 绝不输出 NaN / undefined / null', () => {
  const money = createTooltipFormatter(formatMoney)

  it('正常数值按传入的格式化器输出', () => {
    const text = money({ seriesName: '现金余额', value: 325310.09, marker: '' })
    expect(text).toBe('现金余额：¥325,310.09')
  })

  it('值为 null 时显示「无」', () => {
    expect(money({ seriesName: '净损益', value: null })).toContain(NO_DATA_TEXT)
  })

  it('值为 NaN 或 Infinity 时显示「无」', () => {
    expect(money({ seriesName: '净损益', value: NaN })).toContain(NO_DATA_TEXT)
    expect(money({ seriesName: '净损益', value: Infinity })).toContain(NO_DATA_TEXT)
  })

  it('多维值取最后一维（散点 [x, y] 的 y）', () => {
    expect(money({ seriesName: '频次', value: [12, 345.6] })).toContain('345.60')
  })

  it('百分比为 NaN 时不拼接 "NaN%"', () => {
    const percent = createTooltipFormatter(formatNullablePercent)
    const text = percent({ seriesName: '占比', value: 33.33, percent: NaN })
    expect(text).not.toContain('NaN')
    expect(text).toContain('33.33%')
  })

  it('百分比有效时正常拼接', () => {
    const percent = createTooltipFormatter(formatNullablePercent)
    expect(percent({ seriesName: '占比', value: 33.33, percent: 12.5 })).toContain('(12.50%)')
  })

  it('空参数数组返回「无」而不是空串', () => {
    expect(money([])).toBe(NO_DATA_TEXT)
  })

  it('任意输入组合下输出都不含 NaN / undefined / null 字面量', () => {
    const inputs: unknown[] = [
      { value: null },
      { value: NaN },
      { value: undefined },
      { value: Infinity },
      { seriesName: null, value: 1 },
      { name: undefined, value: null },
      {},
      null,
      undefined,
    ]
    for (const input of inputs) {
      const text = money(input)
      expect(text).not.toContain('NaN')
      expect(text).not.toContain('undefined')
      expect(text).not.toContain('null')
    }
  })

  it('计数格式化器同样兜底', () => {
    const count = createTooltipFormatter(formatCount)
    expect(count({ seriesName: '笔数', value: NaN })).not.toContain('NaN')
  })
})

describe('chart · tooltip 的 HTML 转义', () => {
  it('转义五个 HTML 特殊字符', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
    expect(escapeHtml('a & b')).toBe('a &amp; b')
    expect(escapeHtml('"双引号"')).toBe('&quot;双引号&quot;')
    expect(escapeHtml("'单引号'")).toBe('&#39;单引号&#39;')
  })

  it('& 先于其他字符转义，不会产生二次转义错误', () => {
    // 若先替换 < 再替换 &，这里会得到 &amp;lt;
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('&lt;')).toBe('&amp;lt;')
  })

  it('系列名里的 HTML 会被转义后再拼进 tooltip', () => {
    const money = createTooltipFormatter(formatMoney)
    const text = money({ seriesName: '<img src=x onerror=alert(1)>', value: 1, marker: '' })
    expect(text).not.toContain('<img')
    expect(text).toContain('&lt;img')
  })

  it('类目名（name）同样被转义', () => {
    const money = createTooltipFormatter(formatMoney)
    const text = money({ name: '<b>餐饮</b>', value: 1 })
    expect(text).not.toContain('<b>')
    expect(text).toContain('&lt;b&gt;')
  })
})
