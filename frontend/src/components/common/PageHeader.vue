<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  eyeline?: string
}>()
</script>

<template>
  <header class="page-header">
    <div class="page-header__copy">
      <p v-if="eyeline" class="page-header__eyeline">{{ eyeline }}</p>
      <h1 class="page-header__title">{{ title }}</h1>
      <p v-if="description" class="page-header__description">{{ description }}</p>
      <slot name="meta" />
    </div>
    <div v-if="$slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  flex-wrap: wrap;
  gap: 0.875rem 1.5rem;
  align-items: flex-end;
  justify-content: space-between;
  padding: 0.25rem 0 1rem;
  border-bottom: 1px solid var(--nb-border);
}

.page-header__copy {
  max-width: 50rem;
}

.page-header__eyeline {
  margin: 0 0 0.25rem;
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.page-header__title {
  margin: 0;
  font-size: clamp(1.25rem, 2.4vw, 1.5rem);
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.015em;
}

.page-header__description {
  max-width: 70ch;
  margin: 0.375rem 0 0;
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--nb-text-muted);
}

.page-header__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
</style>
