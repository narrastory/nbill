<script setup lang="ts">
import { computed, ref } from 'vue'

import type { LifeThought } from '@/utils/dailyThought'

const props = defineProps<{
  thought: LifeThought
  date: Date
}>()

const expanded = ref(false)
const isLong = computed(() => props.thought.content.length > 120)
const dateLabel = computed(() =>
  new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(props.date),
)
</script>

<template>
  <section class="daily-thought" aria-labelledby="daily-thought-title">
    <span class="daily-thought__quote-mark" aria-hidden="true">“</span>

    <header class="daily-thought__header">
      <div>
        <h2 id="daily-thought-title" class="daily-thought__title">今日一念</h2>
        <p class="daily-thought__date">{{ dateLabel }}</p>
      </div>
      <span class="daily-thought__number">第 {{ thought.id }} 则</span>
    </header>

    <blockquote
      class="daily-thought__content"
      :class="{ 'is-collapsed': isLong && !expanded }"
    >
      {{ thought.content }}
    </blockquote>

    <footer v-if="thought.author || isLong" class="daily-thought__footer">
      <cite v-if="thought.author" class="daily-thought__author">—— {{ thought.author }}</cite>
      <button
        v-if="isLong"
        type="button"
        class="daily-thought__toggle"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? '收起' : '展开全文' }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.daily-thought {
  position: relative;
  padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1.25rem, 5vw, 3rem);
  overflow: hidden;
  background:
    linear-gradient(90deg, var(--nb-primary) 0 0.25rem, transparent 0.25rem),
    color-mix(in srgb, var(--nb-primary) 3%, var(--nb-surface));
  border: 1px solid var(--nb-border);
  border-radius: var(--nb-radius-data);
}

.daily-thought__quote-mark {
  position: absolute;
  top: -1.25rem;
  right: clamp(1rem, 5vw, 3rem);
  font-family: Georgia, 'Songti SC', 'STSong', serif;
  font-size: clamp(7rem, 15vw, 11rem);
  line-height: 1;
  color: color-mix(in srgb, var(--nb-primary) 8%, transparent);
  pointer-events: none;
  user-select: none;
}

.daily-thought__header {
  position: relative;
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 1rem;
  border-bottom: 1px solid color-mix(in srgb, var(--nb-primary) 18%, var(--nb-border));
}

.daily-thought__title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 650;
  color: var(--nb-text);
}

.daily-thought__date,
.daily-thought__number {
  margin: 0.25rem 0 0;
  font-size: 0.75rem;
  color: var(--nb-text-muted);
}

.daily-thought__number {
  position: relative;
  flex: 0 0 auto;
  padding: 0.25rem 0.625rem;
  margin: 0;
  background: color-mix(in srgb, var(--nb-primary) 7%, transparent);
  border-radius: 999px;
}

.daily-thought__content {
  position: relative;
  max-width: 66ch;
  margin: clamp(1.25rem, 3vw, 2rem) 0 0;
  font-family: 'Songti SC', 'STSong', 'Noto Serif CJK SC', Georgia, serif;
  font-size: clamp(1.125rem, 2.5vw, 1.375rem);
  font-weight: 500;
  line-height: 1.85;
  color: var(--nb-text);
  text-wrap: pretty;
}

.daily-thought__content.is-collapsed {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
}

.daily-thought__footer {
  position: relative;
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  max-width: 66ch;
  margin-top: 1rem;
}

.daily-thought__author {
  font-family: 'Songti SC', 'STSong', 'Noto Serif CJK SC', Georgia, serif;
  font-size: 0.875rem;
  font-style: normal;
  color: var(--nb-text-muted);
}

.daily-thought__toggle {
  min-height: 2.5rem;
  padding: 0 0.25rem;
  margin-left: auto;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--nb-primary);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 0.25rem;
}

.daily-thought__toggle:hover {
  color: var(--color-brand-700);
}

.daily-thought__toggle:focus-visible {
  outline: 2px solid var(--nb-primary);
  outline-offset: 2px;
}

@media (max-width: 639px) {
  .daily-thought__quote-mark {
    top: -0.5rem;
    right: 0.75rem;
    font-size: 6rem;
  }

  .daily-thought__content {
    line-height: 1.75;
  }
}
</style>
