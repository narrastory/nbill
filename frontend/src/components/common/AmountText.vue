<script setup lang="ts">
import { computed } from 'vue'

import { formatCompactMoney, formatMoney } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    amount: number | null | undefined
    direction?: 'income' | 'expense' | 'neutral'
    showSign?: boolean
    compact?: boolean
  }>(),
  { direction: 'neutral', showSign: false, compact: false },
)

const text = computed(() => {
  if (props.amount === null || props.amount === undefined || !Number.isFinite(props.amount)) return '--'
  const absolute = Math.abs(props.amount)
  const formatted = props.compact ? formatCompactMoney(absolute) : formatMoney(absolute)
  if (!props.showSign) return props.amount < 0 ? `-${formatted}` : formatted
  if (props.amount === 0) return formatted
  return `${props.amount > 0 ? '+' : '-'}${formatted}`
})
</script>

<template>
  <span
    class="amount-text nb-amount tabular"
    :class="{
      'nb-amount--income': direction === 'income',
      'nb-amount--expense': direction === 'expense',
    }"
  >{{ text }}</span>
</template>

<style scoped>
.amount-text {
  white-space: nowrap;
}
</style>
