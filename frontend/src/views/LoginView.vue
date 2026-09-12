<script setup lang="ts">
/**
 * 登录页。
 *
 * 设计：全屏本地背景图 + 毛玻璃卡片；进入卡片时背景轻微推近并失焦。
 *       品牌标识独立于卡片，固定在页面左上角。
 * 交互：登录失败保留用户名、清空密码；提交期间禁用按钮防重复提交。
 * 安全：不保存也不打印密码。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ElMessage, type FormInstance, type FormRules } from 'element-plus'

import SnowFall from '@/components/common/SnowFall.vue'
import { useAuthStore } from '@/stores/auth'
import { ApiError } from '@/types/api'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const submitting = ref(false)
/** 挂载后再触发进入动画，避免首帧就被浏览器合并掉。 */
const entered = ref(false)

const form = reactive({
  username: '',
  password: '',
})

const rules: FormRules<typeof form> = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

const year = new Date().getFullYear()
const copyright = computed(() => `Copyright ©️ ${year} Narrastory`)

onMounted(() => {
  requestAnimationFrame(() => {
    entered.value = true
  })
})

async function handleSubmit(): Promise<void> {
  if (submitting.value) return

  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await auth.login(form.username.trim(), form.password)
    // 密码不在任何地方留存，成功后立即从内存清掉。
    form.password = ''
    await auth.verifySession()

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : null
    await router.replace(redirect && redirect !== '/' ? redirect : { name: 'dashboard' })
  } catch (error) {
    // 失败时保留用户名，只清空密码。
    form.password = ''
    const message =
      error instanceof ApiError
        ? error.status === 401
          ? '用户名或密码错误'
          : error.message
        : '登录失败，请稍后重试'
    ElMessage.error(message)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <!-- 背景两层：底图（悬浮时自身失焦推近）+ 压暗遮罩 -->
    <div class="login-page__backdrop" aria-hidden="true"></div>
    <div class="login-page__scrim" aria-hidden="true"></div>

    <SnowFall />

    <!-- 品牌独立于卡片，占据页面左上角 -->
    <div class="login-page__brand" :class="{ 'is-entered': entered }">
      <img src="/icon-512.png" alt="" class="login-page__brand-logo" width="40" height="40" />
      <span class="login-page__brand-name">NBill</span>
    </div>

    <div class="login-page__content" :class="{ 'is-entered': entered }">
      <section class="login-card">
        <header class="login-card__header">
          <h1 class="login-card__title">打开你的账本</h1>
          <p class="login-card__subtitle">登录后继续记录、核对和回顾现金变化</p>
        </header>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          size="large"
          class="login-card__form"
          hide-required-asterisk
          @submit.prevent="handleSubmit"
        >
          <el-form-item label="用户名" prop="username">
            <el-input
              v-model="form.username"
              placeholder="请输入用户名"
              autocomplete="username"
              :disabled="submitting"
            />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              autocomplete="current-password"
              show-password
              :disabled="submitting"
              @keyup.enter="handleSubmit"
            />
          </el-form-item>

          <el-button
            type="primary"
            size="large"
            class="login-card__submit"
            :loading="submitting"
            native-type="submit"
            @click="handleSubmit"
          >
            {{ submitting ? '登录中…' : '登录' }}
          </el-button>
        </el-form>
      </section>

      <p class="login-page__copyright">{{ copyright }}</p>
    </div>
  </main>
</template>

<style scoped>
/**
 * 纵向 flex：品牌在文档流里占第一行（自然贴左上角），
 * 卡片容器在剩余空间内居中（收缩行为见 .login-page__content）。
 * 用绝对定位把品牌钉在角落也可以，但那样在矮视口下会和居中的卡片重叠；
 * 走文档流则天然不可能撞上。
 */
.login-page {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  padding: clamp(1rem, 4vw, 3rem);
  overflow: hidden;
  background-color: var(--color-ink-900);
}

/**
 * 底图默认保持清晰；鼠标进入卡片或键盘焦点进入表单时，背景轻微推近并
 * 柔和失焦。卡片自身不移动，让输入区域始终稳定。
 */
.login-page__backdrop {
  position: absolute;
  inset: 0;
  background-image: url('@/assets/images/login-background.jpg');
  background-size: cover;
  background-position: center;
  filter: saturate(0.92);
  transform: scale(1.01);
  transition:
    filter 420ms var(--ease-out-soft),
    transform 420ms var(--ease-out-soft);
  will-change: filter, transform;
}

.login-page:has(.login-card:hover) .login-page__backdrop,
.login-page:has(.login-card:focus-within) .login-page__backdrop {
  filter: blur(3px) saturate(0.88);
  transform: scale(1.035);
}

/* 压暗 + 绿色调色，保证白色文字与卡片有足够对比度 */
.login-page__scrim {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgb(2 30 22 / 0.42) 0%, rgb(2 30 22 / 0.68) 100%),
    radial-gradient(120% 90% at 50% 0%, rgb(23 76 60 / 0.2) 0%, transparent 60%);
}

/**
 * 品牌标识：占据 flex 第一行，自然落在左上角。
 *
 * "NBill" 带一圈深色描边 —— 背景默认是**清晰**照片（见上面的失焦层），
 * 左上角完全可能落在浅色区域上，纯白文字会直接消失。
 * 用 -webkit-text-stroke 配 paint-order: stroke fill：paint-order 让描边画在
 * 字形**背后**，不会像默认那样从笔画内侧啃掉一圈把字变细。
 */
.login-page__brand {
  position: relative;
  z-index: 1;
  display: flex;
  /* 矮视口下不许被压缩：flex 项默认可收缩，压缩后卡片会顶上来压住品牌 */
  flex-shrink: 0;
  gap: 0.625rem;
  align-items: center;
  /* 与卡片之间始终留出间距，矮视口下两者会紧挨在一起 */
  margin-bottom: clamp(0.75rem, 2vh, 1.5rem);
  opacity: 0;
  transition: opacity var(--duration-slow) var(--ease-out-soft);
}

.login-page__brand.is-entered {
  opacity: 1;
}

.login-page__brand-logo {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.625rem;
  box-shadow: 0 8px 20px -8px rgb(2 44 34 / 0.55);
}

.login-page__brand-name {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #ffffff;
  /* 4px 描边里有一半被字形盖住，实际可见约 2px */
  -webkit-text-stroke: 4px rgb(2 30 22 / 0.55);
  paint-order: stroke fill;
  /* 兜底：万一 paint-order 不被支持（描边会啃细笔画、字心变实），
     这层柔光仍保证浅色背景上的可读性 */
  text-shadow: 0 2px 12px rgb(2 30 22 / 0.55);
}

/**
 * 卡片容器：在品牌之外的剩余空间里居中。
 *
 * `flex: 1 0 auto` —— 可伸长但**不可收缩**。收缩会让容器低于卡片实际高度，
 * 卡片溢出去压住上面的品牌；不收缩则整页长高、由浏览器滚动，这才是矮视口
 * 下应有的行为（横屏手机上本来就必须滚动才能看到登录按钮）。
 */
.login-page__content {
  position: relative;
  z-index: 2;
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(1rem, 3vh, 1.75rem);
  width: 100%;
  max-width: 26rem;
  margin-inline: auto;
  opacity: 0;
  transform: translateY(1rem);
  transition:
    opacity var(--duration-slow) var(--ease-out-soft),
    transform var(--duration-slow) var(--ease-out-soft);
}

.login-page__content.is-entered {
  opacity: 1;
  transform: translateY(0);
}

/**
 * 卡片本身不做悬浮位移；交互反馈只发生在背景层，避免干扰输入。
 */
.login-card {
  width: 100%;
  padding: clamp(1.5rem, 5vw, 2.25rem);
  border: 1px solid rgb(255 255 255 / 0.28);
  border-radius: 1.25rem;
  /* 毛玻璃：backdrop-filter 在卡片自身，背景模糊在 backdrop 层 */
  background: rgb(255 255 255 / 0.14);
  backdrop-filter: blur(20px) saturate(1.4);
  -webkit-backdrop-filter: blur(20px) saturate(1.4);
  box-shadow: var(--shadow-float);
}

.login-card__header {
  margin-bottom: 1.5rem;
  text-align: center;
}

.login-card__title {
  margin: 0 0 0.375rem;
  font-size: clamp(1.375rem, 4vw, 1.625rem);
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #ffffff;
}

.login-card__subtitle {
  margin: 0;
  font-size: 0.875rem;
  color: rgb(255 255 255 / 0.78);
}

.login-card__form :deep(.el-form-item__label) {
  font-weight: 500;
  color: rgb(255 255 255 / 0.88);
}

/* 输入框在毛玻璃上需要自己的浅底，否则边框几乎不可见 */
.login-card__form :deep(.el-input__wrapper) {
  background-color: rgb(255 255 255 / 0.9);
  box-shadow: 0 0 0 1px rgb(255 255 255 / 0.5) inset;
  transition: box-shadow var(--duration-base) var(--ease-out-soft);
}

.login-card__form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--color-brand-400) inset;
}

/* 聚焦过渡：与主题绿一致，键盘操作时同样可见 */
.login-card__form :deep(.el-input__wrapper.is-focus) {
  box-shadow:
    0 0 0 1px var(--nb-primary) inset,
    0 0 0 4px rgb(22 163 74 / 0.22);
}

.login-card__submit {
  width: 100%;
  margin-top: 0.5rem;
  font-weight: 600;
  /* 按压反馈 */
  transition: transform var(--duration-fast) var(--ease-out-soft);
}

.login-card__submit:active {
  transform: scale(0.985);
}

.login-page__copyright {
  margin: 0;
  font-size: 0.8125rem;
  color: rgb(255 255 255 / 0.72);
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .login-page__backdrop {
    transition: none;
  }

  .login-page:has(.login-card:hover) .login-page__backdrop,
  .login-page:has(.login-card:focus-within) .login-page__backdrop {
    transform: scale(1.01);
  }
}
</style>
