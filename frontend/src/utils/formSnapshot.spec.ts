import { describe, expect, it } from 'vitest'

import { stableFormSnapshot } from './formSnapshot'

describe('stableFormSnapshot', () => {
  it('does not treat object key order as a form change', () => {
    expect(stableFormSnapshot({ amount: '12', date: '2026-09-11' })).toBe(
      stableFormSnapshot({ date: '2026-09-11', amount: '12' }),
    )
  })

  it('detects changed primitive values and array membership', () => {
    const original = stableFormSnapshot({ amount: '', tags: ['日常'] })
    expect(stableFormSnapshot({ amount: '20', tags: ['日常'] })).not.toBe(original)
    expect(stableFormSnapshot({ amount: '', tags: ['日常', '工作日'] })).not.toBe(original)
  })
})
