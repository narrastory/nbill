# NBill 部署与本地维护手册

本文面向从 GitHub 克隆 NBill 后，在个人电脑上安装、配置、启动、备份和升级的使用者。NBill 是本地优先的单用户程序，默认不需要云服务或外部数据库。

## 1. 环境要求

- Node.js 20.19 或更高版本
- npm 9 或更高版本
- Windows、Linux 或 macOS

检查版本：

```bash
node --version
npm --version
```

## 2. 安装

在仓库根目录执行：

```bash
npm run setup
```

这会分别根据 `backend/package-lock.json` 和 `frontend/package-lock.json` 安装两端依赖，不会创建或修改账本。

## 3. 创建本地配置

Windows PowerShell：

```powershell
Copy-Item examples/config.example.json backend/config.json
```

Linux/macOS：

```bash
cp examples/config.example.json backend/config.json
```

真实 `backend/config.json` 已被 Git 忽略。至少完成以下设置：

- `user.username`：自己的登录名；
- `auth.jwtSecret`：足够长的随机字符串，不得保持为空；
- `business.initialBalance`：第一笔已录入流水之前实际持有的现金余额；
- `server.port`：默认 `9081`；
- `server.host`：`127.0.0.1` 仅允许本机访问，`0.0.0.0` 允许局域网网卡接收连接。

### 配置字段

| 路径 | 含义 |
| --- | --- |
| `server.port` | HTTP 端口 |
| `server.host` | 监听地址 |
| `user.username` | 唯一登录用户名 |
| `auth.jwtSecret` | JWT 签名密钥，必须设置 |
| `auth.jwtExpiry` | token 有效期，如 `2h` |
| `auth.bruteForce.*` | 连续失败后的延迟策略 |
| `business.initialBalance` | 首笔流水之前的期初现金，不计入收入 |
| `business.editWindowDays` | 普通编辑时间窗口 |
| `analytics.monthInterval` | 现金趋势采样月间隔 |
| `analytics.recentMonths` | 近期分类分析月数；`0` 表示全部 |
| `storage.dataDir` | 加密账本与密码材料目录 |
| `storage.logsDir` | 日志目录 |
| `storage.backupsDir` | 自动和维护备份目录 |
| `storage.autoSaveIntervalMs` | 自动保存间隔 |
| `storage.backupIntervalHours` | 启动备份间隔 |
| `storage.maxBackups` | 最多保留的备份数 |
| `cors.origin` | 开发前端允许的 Origin |
| `logging.*` | 日志级别、目录和轮换规则 |

`NBILL_CONFIG_PATH`、`NBILL_DATA_DIR` 和 `NBILL_PORT` 环境变量可以临时覆盖配置文件路径、数据目录和端口。日常使用通常不需要设置 `NBILL_CONFIG_PATH`；自动化测试用它隔离公开测试配置与私人配置。

## 4. 设置密码

首次运行前，在仓库根目录执行：

```bash
npm run set-password
```

密码不会写入配置或 Git；脚本会在 `backend/data/` 创建密码哈希、主盐和后续加密数据所需文件。忘记密码后没有后门可恢复密文，请妥善保存密码和完整备份。

修改密码时也使用同一命令。修改前必须停止后端服务。脚本会先验证旧密码、完整解密现有数据、创建安全备份，再通过暂存和回读验证原子替换数据。

## 5. 开发运行

分别打开两个终端并在仓库根目录运行：

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

默认前端为 `http://localhost:5173`，默认 API 为 `http://localhost:9081/api`。开发环境中前端通过 Vite 代理访问后端。

## 6. 本地生产运行

先构建并发布前端：

```bash
npm run build
```

该命令生成 `frontend/dist/`，再用经过测试的脚本清理并重建 `backend/public/`。它不会访问账本、配置或备份目录。

启动整合后的应用：

```bash
npm start
```

此时 Express 同时提供 `/api/*` 和前端静态页面。按 `Ctrl+C` 关闭，后端会先尝试保存内存中的最新数据。

## 7. 测试

发布或升级前执行：

```bash
npm test
npm run typecheck
npm run build
```

后端测试使用临时测试数据，不读取或修改正式 `backend/data/`。

## 8. 数据、日志与备份

本地运行目录如下，均不进入 Git：

```text
backend/
├─ config.json
├─ data/
│  ├─ password.hash
│  ├─ master.salt
│  ├─ idCounters.json
│  ├─ transactions.enc
│  ├─ bill_categories.json
│  ├─ bill_tags.json
│  ├─ external_transactions.enc
│  ├─ ex_flow_types.json
│  └─ ex_related_parties.enc
├─ logs/
├─ backups/
└─ exported_data/
```

敏感表使用 AES-256-GCM，加密密钥由密码通过 PBKDF2-SHA512 派生。每个完整备份目录包含 `manifest.json` 与校验值；恢复时必须使用同一备份目录中的完整文件集，不能混合主盐、密码哈希和密文。

服务启动时会按 `backupIntervalHours` 检查并创建备份。换密、CSV 导入和明确确认的历史记录纠错也会在修改前创建备份。备份同样包含私人数据，应放在可信磁盘中，不要上传到 GitHub。

## 9. CSV 导入与导出

这些命令在 `backend/` 的 npm 脚本中：

```bash
npm --prefix backend run import-csv
npm --prefix backend run export-csv -- <密码> [输出目录]
```

导入时需要将六个完整 CSV 表放入 `backend/表结构示例(测试)/`。该目录已被 Git 忽略；缺少任一表、字段校验失败或引用关系不完整时，脚本不会替换正式数据。

导入和其他维护操作前必须停止服务，以免进程内旧数据覆盖磁盘。导出的 CSV 是明文私人账本，默认 `backend/exported_data/` 已被忽略，但仍应谨慎保管。

## 10. 从 Git 更新

更新代码前先停止服务，并另行复制 `backend/config.json`、`backend/data/` 和 `backend/backups/` 到安全位置。拉取新版本后执行：

```bash
npm run setup
npm test
npm run typecheck
npm run build
```

根级构建不会删除私人数据，但重要账本仍应遵循“升级前额外备份”的原则。

## 11. 常见问题

### 启动后立即退出：`Config file not found`

确认已将 `examples/config.example.json` 复制到 `backend/config.json`，并填写非空的 `auth.jwtSecret`。

### 启动后立即退出：端口已被占用

关闭占用 `9081` 的旧进程，或临时设置 `NBILL_PORT`。同一数据目录只允许一个后端实例持有锁。

### 页面能打开但 API 无法连接

开发时确认两个服务都已启动，并检查 `frontend/.env.example` 所描述的代理地址。生产时重新执行 `npm run build`，再启动后端。

### Git 状态中看不到数据文件

这是预期行为。`.gitignore` 主动排除了真实配置、账本、日志、备份、明文导出和构建产物。Git 不能代替账本备份。

## 12. 接口与业务口径

所有请求字段、响应结构、日期范围、期初/期末现金和分析含义见 [前端开发用后端手册](frontend-backend-manual/README.md)。修改前后端接口时应同步更新该文档。
