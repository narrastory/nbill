import { describe, expect, it } from 'vitest'

import { selectDailyThought, type LifeThought } from '@/utils/dailyThought'

const thoughts: LifeThought[] = [
  { id: 1, content: '第一条', author: null, section: 1 },
  { id: 2, content: '第二条', author: '作者', section: 1 },
  { id: 3, content: '第三条', author: null, section: 2 },
]

describe('selectDailyThought', () => {
  it('同一个本地日期始终返回同一条格言', () => {
    const morning = selectDailyThought(thoughts, new Date(2026, 8, 11, 8, 0))
    const evening = selectDailyThought(thoughts, new Date(2026, 8, 11, 23, 59))

    expect(morning).not.toBeNull()
    expect(morning?.id).toBe(evening?.id)
  })

  it('相邻日期返回不同的格言', () => {
    const today = selectDailyThought(thoughts, new Date(2026, 8, 11, 12, 0))
    const tomorrow = selectDailyThought(thoughts, new Date(2026, 8, 12, 12, 0))

    expect(today?.id).not.toBe(tomorrow?.id)
  })

  it('经过完整列表长度后循环到同一条格言', () => {
    const first = selectDailyThought(thoughts, new Date(2026, 8, 11, 12, 0))
    const wrapped = selectDailyThought(thoughts, new Date(2026, 8, 14, 12, 0))

    expect(first?.id).toBe(wrapped?.id)
  })

  it('列表为空时安全返回 null', () => {
    expect(selectDailyThought([], new Date(2026, 8, 11))).toBeNull()
  })
})
