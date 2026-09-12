# NBill 前端开发用后端手册

本目录是前端团队使用后端所需的完整资料，不依赖项目目录之外的任何文件。内容对应 NBill v3.0 当前实现与自动化测试。

## 先看这里

- 后端地址：`http://localhost:9081`
- API 根地址：`http://localhost:9081/api`
- 前端开发地址默认：`http://localhost:5173`
- 数据格式：JSON
- 日期格式：`YYYY-MM-DD`
- 金额类型：JSON number，最多按两位小数展示
- 身份认证：JWT Bearer Token
- 单用户系统：用户名由后端配置，密码由用户在登录页输入
- 除登录外，所有 API 都需要登录

请勿把真实密码写入源码、环境变量示例、提交记录或浏览器日志。

## 推荐阅读顺序

1. [DATA_SCHEMA.md](./DATA_SCHEMA.md)：先理解六张业务表及字段关系。
2. [BUSINESS_RULES.md](./BUSINESS_RULES.md)：理解收支、现金余额、往来款和历史纠错。
3. [API_REFERENCE.md](./API_REFERENCE.md)：按接口实现页面和数据层。
4. [FRONTEND_GUIDE.md](./FRONTEND_GUIDE.md)：处理登录、日期、金额、分页和错误。
5. [FETCH_EXAMPLES.md](./FETCH_EXAMPLES.md)：复制可直接改造的 JavaScript/TypeScript 代码。
6. [CHANGELOG_FOR_FRONTEND.md](./CHANGELOG_FOR_FRONTEND.md)：旧前端迁移时查看字段变化。

## 后端提供的业务模块

| 模块 | 前端用途 | API 前缀 |
| --- | --- | --- |
| 登录与会话 | 登录页、退出登录 | `/api/auth` |
| 系统状态 | 初始化、记录数、编辑窗口 | `/api/status` |
| 日常收支 | 收入/支出列表、录入、修改、删除 | `/api/transactions` |
| 外部往来 | 借出、收回、垫付、归还等独立现金流 | `/api/external-transactions` |
| 分类字典 | 收支类型下的一级/二级分类 | `/api/bill-categories` |
| 标签字典 | 一笔普通流水的多标签 | `/api/bill-tags` |
| 往来类型字典 | 外部往来的业务类型 | `/api/ex-flow-types` |
| 往来方字典 | 与谁发生外部往来 | `/api/ex-related-parties` |
| 数据分析 | 仪表盘、完整分析、未偿款、数据检查 | `/api/analytics` |

## 最小启动流程

```text
1. POST /api/auth/login
2. 保存响应 token
3. GET /api/status
4. 并行加载四个字典接口
5. 加载当前页面需要的流水或分析接口
```

所有受保护请求都带：

```http
Authorization: Bearer <token>
Content-Type: application/json
```

登录成功并不代表 token 永久有效。Token 默认 2 小时过期；后端重启或用户退出后，旧 token 即使尚未到期也不能继续使用。任何 `401` 都应清除本地 token 并回到登录页。

## 推荐页面与接口对应

| 页面 | 首要接口 |
| --- | --- |
| 登录 | `POST /api/auth/login` |
| 首页仪表盘 | `GET /api/analytics/summary` |
| 普通流水 | `GET /api/transactions` |
| 普通流水编辑 | 四个字典 GET + Transactions POST/PUT |
| 外部往来 | `GET /api/external-transactions` |
| 往来款视图 | `GET /api/analytics/external-outstanding` |
| 完整统计 | `GET /api/analytics` |
| 设置/字典管理 | 四组字典接口 |
| 数据诊断 | `GET /api/analytics/data-quality` |

## 前端必须遵守的五条规则

1. 不要把初始余额当作收入，也不要把外部往来混入普通收支。
2. 日期使用本地日历字符串，不要先转 UTC 再截取日期。
3. 分类、子分类、标签、往来类型和往来方必须来自后端字典。
4. 历史更新收到 `403` 后必须让用户二次确认，不能自动重试确认接口。
5. 百分比字段可能为 `null`，前端应显示 `—`，不能显示 `NaN` 或 `Infinity`。

## 接口总览

| 方法 | 路径 | 成功状态 |
| --- | --- | --- |
| POST | `/api/auth/login` | 200 |
| POST | `/api/auth/logout` | 200 |
| GET | `/api/status` | 200 |
| POST | `/api/save` | 200 |
| GET/POST | `/api/transactions` | 200/201 |
| GET/PUT/DELETE | `/api/transactions/:id` | 200 |
| GET/POST | `/api/external-transactions` | 200/201 |
| GET/PUT/DELETE | `/api/external-transactions/:id` | 200 |
| GET/POST/PUT | `/api/bill-categories[...]` | 200/201/200 |
| GET/POST/PUT | `/api/bill-tags[...]` | 200/201/200 |
| GET/POST/PUT | `/api/ex-flow-types[...]` | 200/201/200 |
| GET/POST/PUT | `/api/ex-related-parties[...]` | 200/201/200 |
| GET | `/api/analytics/summary` | 200 |
| GET | `/api/analytics/external-outstanding` | 200 |
| GET | `/api/analytics/data-quality` | 200 |
| GET | `/api/analytics` | 200 |

