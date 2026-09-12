export interface LifeThought {
  id: number
  content: string
  author: string | null
  section: number
}

export function selectDailyThought(
  thoughts: readonly LifeThought[],
  date: Date = new Date(),
): LifeThought | null {
  if (thoughts.length === 0) return null

  // 只取本地年月日，再转成稳定的日序号。这样同一天刷新不会变，跨过本地
  // 午夜后则前进一条，也不会受到当天具体时刻或夏令时天数长度的影响。
  const localDayNumber = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  )
  const index = ((localDayNumber % thoughts.length) + thoughts.length) % thoughts.length

  return thoughts[index] ?? null
}
