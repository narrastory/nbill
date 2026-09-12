<script setup lang="ts">
/**
 * 筛选面板外壳：折叠、字段栅格、操作按钮、已启用条件计数。
 *
 * 只负责"外形与交互"，具体字段用默认插槽传入。
 * 普通收支与外部往来的筛选项不同，但折叠行为、按钮位置、
 * 校验失败提示这些是一致的，因此收敛到这里。
 */
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 已启用的筛选条件数量，用于折叠时提示"还有几个条件生效中"。 */
    activeCount?: number
    /** 窄屏默认折叠，宽屏默认展开。 */
    defaultCollapsed?: boolean
    loading?: boolean
  }>(),
  { activeCount: 0, defaultCollapsed: false, loading: false },
)

const emit = defineEmits<{ search: []; reset: [] }>()

const collapsed = ref(props.defaultCollapsed)

const showSummary = computed(() => collapsed.value && props.activeCount > 0)
</script>

<template>
  <section class="nb-card filter-panel">
    <header class="filter-panel__head">
      <button
        type="button"
        class="filter-panel__toggle"
        :aria-expanded="!collapsed"
        @click="collapsed = !collapsed"
      >
        <span class="filter-panel__chevron" :class="{ 'is-collapsed': collapsed }" aria-hidden="true"
          >▾</span
        >
        <span>筛选条件</span>
        <span v-if="showSummary" class="filter-panel__badge">{{ activeCount }} 项生效中</span>
      </button>
    </header>

    <div v-show="!collapsed" class="filter-panel__body">
      <div class="filter-panel__grid">
        <slot />
      </div>

      <div class="filter-panel__actions">
        <el-button :disabled="loading" @click="emit('reset')">重置</el-button>
        <el-button type="primary" :loading="loading" @click="emit('search')">查询</el-button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.filter-panel {
  padding: 0.75rem 1rem;
}

.filter-panel__head {
  display: flex;
  align-items: center;
}

.filter-panel__toggle {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.25rem 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--nb-text);
  cursor: pointer;
  background: none;
  border: 0;
}

.filter-panel__chevron {
  display: inline-block;
  font-size: 0.75rem;
  color: var(--nb-text-muted);
  transition: transform var(--duration-fast) var(--ease-out-soft);
}

.filter-panel__chevron.is-collapsed {
  transform: rotate(-90deg);
}

.filter-panel__badge {
  padding: 0.0625rem 0.4375rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--color-brand-800);
  background-color: var(--color-brand-100);
  border-radius: 999px;
}

.filter-panel__body {
  margin-top: 0.75rem;
}

.filter-panel__grid {
  display: grid;
  gap: 0.75rem 1rem;
  /* 自适应列数，窄屏自动由 4 列塌到 1 列 */
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
}

.filter-panel__actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  padding-top: 0.75rem;
  margin-top: 0.75rem;
  border-top: 1px solid var(--nb-border);
}
</style>
