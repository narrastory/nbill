# NBill

NBill 是一套本地优先的私人记账程序，包含 Express 后端和 Vue 3 前端。账本、密码材料、日志与备份只保存在本机，不进入 Git 仓库。

`Copyright © 2026 Narrastory`

## 功能概览

- 日常收支与分类、标签管理
- 借出、收回等外部往来记录
- 现金余额、月度收支、分类分布、储蓄率等分析
- 往来未结清分析与数据质量检查
- AES-256-GCM 数据加密、本地备份和安全换密
- 响应式 Vue 3 界面，以及按日期轮换的每日格言

## 仓库结构

```text
NBill/
├─ backend/                  Express API、维护脚本与本地运行目录
│  ├─ src/                   后端源码
│  ├─ tests/                 后端测试
│  ├─ data/                  私人账本（已忽略）
│  ├─ logs/                  运行日志（已忽略）
│  ├─ backups/               本地安全备份（已忽略）
│  ├─ config.json            真实配置（已忽略）
│  └─ public/                前端生产构建（已忽略、可重新生成）
├─ frontend/                 Vue 3 + TypeScript + Vite
├─ docs/                     部署手册与完整 API 契约
├─ examples/                 可公开复制的配置样例
├─ tools/                    仓库级构建辅助脚本
└─ tests/repository/         仓库级脚本测试
```

前后端放在同一个仓库，但依赖和 lockfile 相互独立。这样可以让接口与实现保持同步，也不会把两套构建工具强行混在一起。

## 环境要求

- Node.js 20.19 或更高版本
- npm 9 或更高版本

## 首次运行

安装两端依赖：

```bash
npm run setup
```

复制公开配置样例：

```powershell
Copy-Item examples/config.example.json backend/config.json
```

Linux/macOS 可使用：

```bash
cp examples/config.example.json backend/config.json
```

然后编辑 `backend/config.json`：

1. 设置自己的 `user.username`；
2. 为 `auth.jwtSecret` 生成并填写一段足够长的随机字符串；
3. 按实际情况填写 `business.initialBalance`；
4. 如需改变端口、监听地址或数据路径，再调整对应字段。

设置本地登录密码：

```bash
npm run set-password
```

仓库不包含默认账号、默认密码或任何示例账本。密码只由上述本地脚本写入 `backend/data/`。

## 开发

分别打开两个终端：

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

默认前端地址为 `http://localhost:5173`，开发代理默认连接 `http://localhost:9081`。API 字段和业务口径以 [前端接口手册](docs/FRONTEND_API.md) 为准。

## 测试与构建

```bash
npm test          # 仓库脚本 + 后端 + 前端测试
npm run typecheck # 前端 TypeScript 检查
npm run build     # 构建前端并发布到 backend/public
npm start         # 后端同时提供 API 和生产前端
```

`npm run build` 只会重建 `backend/public/`，不会接触 `backend/data/`、`backend/backups/` 或真实配置。

## 文档

- [部署与本地维护](docs/DEPLOY.md)
- [完整 API 契约](docs/FRONTEND_API.md)
- [前端开发说明](frontend/README.md)

## 隐私与发布检查

提交前至少运行：

```bash
git status --short
git diff --cached
```

确认没有将 `backend/config.json`、`backend/data/`、`backend/logs/`、`backend/backups/`、`.env*` 或导出的 CSV 加入提交。若某个敏感文件曾经进入 Git 历史，仅添加 `.gitignore` 不足以清除它，应在发布前重写历史并更换相关密钥。

## 许可证

本项目使用 [ISC License](LICENSE)。
