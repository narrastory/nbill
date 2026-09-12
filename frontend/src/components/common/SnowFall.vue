<script setup lang="ts">
/**
 * 冬季雪花层。
 *
 * 实现取向：少量 DOM + 纯 CSS 动画，全部作用在 transform / opacity 上，
 * 由合成器线程处理，不触发重排。粒子参数一次性随机生成后写进 CSS 自定义属性，
 * 之后不再参与响应式更新。
 *
 * 淡出：关键帧末尾把 opacity 收到 0，粒子"落到底部时基本淡出"。
 * reduced-motion 下 `enabled` 为 false，整个层不渲染。
 */
import { computed, watch } from 'vue'

import { useSnowfall } from '@/composables/useSnowfall'

interface Particle {
  left: number
  size: number
  duration: number
  delay: number
  opacity: number
  drift: number
  blur: boolean
}

const { enabled, particleCount } = useSnowfall()

/** 非响应式容器：粒子生成后不再变化，避免无谓的依赖追踪。 */
let particles: Particle[] = []

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function generate(count: number): Particle[] {
  // 用负延迟让粒子在首帧就散布在整个下落区间，避免"一起从顶部开始"。
  const maxDuration = 16
  return Array.from({ length: count }, () => ({
    left: randomBetween(0, 100),
    size: randomBetween(6, 18),
    duration: randomBetween(8, maxDuration),
    delay: -randomBetween(0, maxDuration),
    opacity: randomBetween(0.25, 0.85),
    drift: randomBetween(-60, 60),
    // 少量远景雪花加模糊，制造景深，同时把粒子数控制在低成本范围。
    blur: Math.random() < 0.3,
  }))
}

watch(
  particleCount,
  (count) => {
    particles = count > 0 ? generate(count) : []
  },
  { immediate: true },
)

const items = computed(() => (enabled.value ? particles : []))
</script>

<template>
  <div v-if="items.length > 0" class="snow-layer" aria-hidden="true">
    <span
      v-for="(particle, index) in items"
      :key="index"
      class="snowflake"
      :class="{ 'snowflake--blur': particle.blur }"
      :style="{
        '--snow-left': `${particle.left}%`,
        '--snow-size': `${particle.size}px`,
        '--snow-duration': `${particle.duration}s`,
        '--snow-delay': `${particle.delay}s`,
        '--snow-opacity': particle.opacity,
        '--snow-drift': `${particle.drift}px`,
      }"
    />
  </div>
</template>

<style scoped>
.snow-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  /* 雪花层永远不参与命中测试，也不影响下方内容的可读性。 */
  z-index: 1;
}

.snowflake {
  position: absolute;
  top: 0;
  left: var(--snow-left);
  width: var(--snow-size);
  height: var(--snow-size);
  border-radius: 50%;
  background: radial-gradient(circle at 50% 50%, #ffffff 0%, rgb(255 255 255 / 0.7) 60%, transparent 100%);
  animation: nb-snow-fall var(--snow-duration) linear var(--snow-delay) infinite;
  will-change: transform, opacity;
}

.snowflake--blur {
  filter: blur(1.5px);
}

@keyframes nb-snow-fall {
  0% {
    transform: translate3d(0, -12vh, 0);
    opacity: 0;
  }
  /* 进入视口后淡入到各自的不透明度 */
  8% {
    opacity: var(--snow-opacity);
  }
  /* 下落过程中保持，接近底部时再收干净 */
  75% {
    opacity: var(--snow-opacity);
  }
  100% {
    transform: translate3d(var(--snow-drift), 108vh, 0);
    opacity: 0;
  }
}

/* 双重保险：即使 JS 判断失误，系统级 reduce 也不播放动画。 */
@media (prefers-reduced-motion: reduce) {
  .snow-layer {
    display: none;
  }
}
</style>
