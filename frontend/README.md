# NBill 前端

NBill 的 Vue 3 + TypeScript + Vite 前端。它只负责界面与 API 调用，不保存登录密码或账本数据。

## 本目录开发

从仓库根目录安装全部依赖：

```bash
npm run setup
```

启动后端和前端开发服务：

```bash
npm run dev:backend
npm run dev:frontend
```

也可以在本目录执行 `npm run dev`。默认访问 `http://localhost:5173`；`/api/*` 由 Vite 代理到 `http://localhost:9081`。

后端不可用时，界面应显示连接失败状态，不使用伪造数据填充业务区域。

## 常用命令

```bash
npm test            # Vitest 测试
npm run typecheck   # TypeScript 类型检查
npm run build       # 生成 frontend/dist
npm run preview     # 本地预览 frontend/dist
```

从仓库根目录执行 `npm run build` 时，会在前端构建完成后将 `frontend/dist/` 发布到 `backend/public/`，供 Express 同源提供。

## 环境变量

复制 `.env.example` 后按需修改。真实用户名、密码、token 和密钥不得写入任何前端环境文件。

| 变量 | 说明 |
| --- | --- |
| `VITE_APP_TITLE` | 浏览器标题中的应用名 |
| `VITE_APP_VERSION` | 界面版本号 |
| `VITE_API_BASE_URL` | API 前缀；默认 `/api` |
| `VITE_BACKEND_ORIGIN` | 仅开发代理使用的后端地址 |

## 源码结构

```text
src/
├─ api/          Axios 实例与资源接口，http.ts 是统一出口
├─ stores/       Pinia 状态与请求协调
├─ types/        业务实体和接口响应类型
├─ utils/        日期、金额、筛选条件与图表辅助逻辑
├─ composables/  可复用组合式逻辑
├─ components/   通用组件、表单、布局和图表
├─ layouts/      主界面框架
├─ router/       路由与鉴权守卫
├─ styles/       主题令牌和全局样式
└─ views/        页面级组件
```

## 数据使用约束

完整接口字段和统计口径见 [`../docs/FRONTEND_API.md`](../docs/FRONTEND_API.md)。开发时尤其注意：

1. 普通收支净额、外部往来现金流和现金余额是三套不同口径；初始余额不是收入。
2. 百分比等统计字段中的 `null` 表示“不适用或不可计算”，不能当作 `0`。
3. 列表、详情和分析接口的包裹层不同，应复用 `src/api/` 与 `src/types/`，不要在页面中重复猜测响应结构。
4. token 只进入 `sessionStorage`；收到 `401` 时清理会话并返回登录页。

## 季节效果

雪花效果只在每年 11 月 7 日至次年 2 月 4 日自动出现。开发模式可以使用 `?snow=1` 或 `?snow=0` 强制切换，以便回归测试。
