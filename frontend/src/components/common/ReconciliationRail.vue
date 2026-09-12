<script setup lang="ts">
import AmountText from './AmountText.vue'

defineProps<{
  opening: number
  operating: number
  external: number
  closing: number
  dateTo?: string | null
}>()
</script>

<template>
  <section class="rail" aria-label="现金余额核对">
    <p class="rail__caption">现金核对{{ dateTo ? ` · 截至 ${dateTo}` : '' }}</p>
    <div class="rail__equation">
      <div class="rail__term">
        <AmountText :amount="opening" />
        <span>期初现金</span>
      </div>
      <span class="rail__operator" aria-hidden="true">+</span>
      <div class="rail__term">
        <AmountText
          :amount="operating"
          :direction="operating >= 0 ? 'income' : 'expense'"
          show-sign
        />
        <span>普通净收入</span>
      </div>
      <span class="rail__operator" aria-hidden="true">+</span>
      <div class="rail__term">
        <AmountText
          :amount="external"
          :direction="external >= 0 ? 'income' : 'expense'"
          show-sign
        />
        <span>外部净现金流</span>
      </div>
      <span class="rail__operator rail__operator--equals" aria-hidden="true">=</span>
      <div class="rail__term rail__term--result">
        <AmountText :amount="closing" />
        <span>期末现金</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.rail {
  padding-top: 1rem;
  margin-top: 1rem;
  border-top: 1px solid color-mix(in srgb, var(--nb-primary) 18%, var(--nb-border));
}

.rail__caption {
  margin: 0 0 0.625rem;
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.rail__equation {
  display: grid;
  grid-template-columns: minmax(8rem, 1fr) auto minmax(8rem, 1fr) auto minmax(8rem, 1fr) auto minmax(8rem, 1fr);
  gap: 0.625rem;
  align-items: center;
}

.rail__term {
  display: flex;
  flex-direction: column;
  gap: 0.1875rem;
  min-width: 0;
}

.rail__term :deep(.amount-text) {
  overflow: hidden;
  font-size: clamp(0.9375rem, 1.8vw, 1.125rem);
  font-weight: 650;
  text-overflow: ellipsis;
}

.rail__term > span:last-child {
  font-size: 0.6875rem;
  color: var(--nb-text-muted);
}

.rail__term--result {
  padding-left: 0.75rem;
  border-left: 2px solid var(--nb-primary);
}

.rail__operator {
  font-size: 1rem;
  color: var(--nb-text-subtle);
}

.rail__operator--equals {
  color: var(--nb-primary);
}

@media (max-width: 639px) {
  .rail__equation {
    grid-template-columns: 1fr auto;
    gap: 0.5rem 0.75rem;
  }

  .rail__operator {
    grid-column: 2;
    grid-row: auto;
  }

  .rail__term {
    grid-column: 1;
  }

  .rail__term--result {
    padding-top: 0.625rem;
    padding-left: 0;
    border-top: 1px solid var(--nb-primary);
    border-left: 0;
  }
}
</style>
