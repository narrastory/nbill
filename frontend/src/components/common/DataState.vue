<script setup lang="ts">
/**
 * 统一的数据状态容器：加载中 / 错误 / 空 / 正常。
 *
 * 手册要求「组件状态完整：加载中、空状态、错误状态、无数据状态」。
 * 把它收敛到一个组件，避免每个页面各写一套，样式与措辞也能保持一致。
 *
 * 用法：
 *   <DataState :loading="s.loading" :error="s.error" :empty="rows.length === 0" @retry="load">
 *     <template #default> ...正常内容... </template>
 *   </DataState>
 */
withDefaults(
  defineProps<{
    loading?: boolean
    error?: string | null
    empty?: boolean
    /** 加载中的骨架行数。 */
    skeletonRows?: number
    emptyText?: string
    emptyHint?: string
  }>(),
  {
    loading: false,
    error: null,
    empty: false,
    skeletonRows: 4,
    emptyText: '暂无数据',
    emptyHint: '',
  },
)

defineEmits<{ retry: [] }>()
</script>

<template>
  <!-- 加载中优先于其它状态：切换筛选时不应先闪一下空状态 -->
  <div v-if="loading" class="data-state" role="status" aria-live="polite">
    <div class="data-state__skeleton">
      <el-skeleton :rows="skeletonRows" animated />
    </div>
    <span class="sr-only">正在加载</span>
  </div>

  <el-result
    v-else-if="error"
    icon="warning"
    title="加载失败"
    :sub-title="error"
    class="data-state"
  >
    <template #extra>
      <el-button type="primary" @click="$emit('retry')">重试</el-button>
    </template>
  </el-result>

  <el-empty v-else-if="empty" :description="emptyText" class="data-state">
    <p v-if="emptyHint" class="data-state__hint">{{ emptyHint }}</p>
  </el-empty>

  <slot v-else />
</template>

<style scoped>
.data-state {
  padding: 1rem 0;
}

.data-state__skeleton {
  padding: 0.5rem;
}

.data-state__hint {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
  color: var(--nb-text-muted);
}
</style>
