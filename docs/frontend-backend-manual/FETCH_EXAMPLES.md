# Fetch / TypeScript 示例

以下代码只依赖浏览器原生 `fetch`。示例不包含真实用户名、密码或 token。

## 通用客户端

```ts
const API_BASE = 'http://localhost:9081/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly payload?: unknown,
  ) {
    super(message);
  }
}

function getToken(): string | null {
  return sessionStorage.getItem('nbill_token');
}

export async function api<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      sessionStorage.removeItem('nbill_token');
      // 在应用层触发导航到登录页。
    }
    const message = payload && typeof payload.error === 'string'
      ? payload.error
      : `Request failed (${response.status})`;
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}
```

## 登录和退出

```ts
interface LoginResponse {
  token: string;
  lastEditTime: string;
  initialBalance: number;
}

export async function login(username: string, password: string) {
  const result = await api<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  sessionStorage.setItem('nbill_token', result.token);
  return result;
}

export async function logout() {
  try {
    await api<{ message: string }>('/auth/logout', { method: 'POST' });
  } finally {
    sessionStorage.removeItem('nbill_token');
  }
}
```

## 构造查询参数

```ts
type QueryValue = string | number | boolean | null | undefined;

export function queryString(values: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== '' && value !== null && value !== undefined) {
      params.set(key, String(value));
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}
```

## 普通收支列表和新增

```ts
// Transaction 接口请直接复制 DATA_SCHEMA.md 中的定义到前端项目 types 文件。
interface PageResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

const qs = queryString({
  type: 'Expense',
  dateFrom: '2026-09-01',
  dateTo: '2026-09-30',
  page: 1,
  limit: 50,
  sortBy: 'BillDate',
  sortOrder: 'desc',
});

const page = await api<PageResult<Transaction>>(`/transactions${qs}`);

const created = await api<{ data: Transaction }>('/transactions', {
  method: 'POST',
  body: JSON.stringify({
    Type: 'Expense',
    Category: '餐饮',
    Subcategory: '午餐',
    Description: '工作日午餐',
    Amount: 28.5,
    BillDate: '2026-09-10',
    Tags: '工作日,餐饮',
  }),
});
```

## 历史编辑二次确认

```ts
export async function updateTransaction(
  id: number,
  changes: Partial<Omit<Transaction, 'ID' | 'BillDate'>>,
  askUser: (message: string) => Promise<boolean>,
) {
  const send = (confirmed: boolean) => api<{ data: Transaction }>(
    `/transactions/${id}${confirmed ? '?confirmHistoricalEdit=true' : ''}`,
    { method: 'PUT', body: JSON.stringify(changes) },
  );

  try {
    return await send(false);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 403) throw error;
    const confirmed = await askUser('该记录已超过编辑窗口。后端将先备份，再修改，是否继续？');
    if (!confirmed) throw error;
    return send(true);
  }
}
```

外部往来更新使用同一流程，只需把路径换成 `/external-transactions/:id`，并禁止提交 `FlowDate`。

## 删除与刷新页码

```ts
await api<{ message: string }>(`/transactions/${id}`, { method: 'DELETE' });

// 删除当前页最后一条记录后，可先回退一页，再重新请求。
const nextPage = currentRows.length === 1 && currentPage > 1
  ? currentPage - 1
  : currentPage;
await loadTransactions(nextPage);
```

## 字典路径编码

```ts
const category = encodeURIComponent('餐饮/日常');
const subcategory = encodeURIComponent('午餐 & 晚餐');

await api(`/bill-categories/${category}/${subcategory}`, {
  method: 'PUT',
  body: JSON.stringify({ newSubcategory: '正餐' }),
});

const tag = encodeURIComponent('工作 日');
await api(`/bill-tags/${tag}`, {
  method: 'PUT',
  body: JSON.stringify({ newDescription: '工作日期间发生' }),
});
```

## 并行加载初始化字典

```ts
const [categories, tags, flowTypes, relatedParties] = await Promise.all([
  api('/bill-categories'),
  api('/bill-tags'),
  api('/ex-flow-types'),
  api('/ex-related-parties'),
]);
```

## 可取消的分析请求

```ts
let analyticsController: AbortController | null = null;

export async function loadAnalytics(dateFrom?: string, dateTo?: string) {
  analyticsController?.abort();
  analyticsController = new AbortController();

  try {
    const qs = queryString({ dateFrom, dateTo });
    return await api(`/analytics${qs}`, {
      signal: analyticsController.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}
```

## 日期与金额格式化

```ts
export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const currency = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
});

export function formatMoney(value: number): string {
  return currency.format(value);
}

export function formatNullablePercent(value: number | null): string {
  return value === null ? '--' : `${value.toFixed(2)}%`;
}
```

请不要使用 `new Date().toISOString().slice(0, 10)` 生成用户选择的本地日期，它在部分时区和时间点可能偏移一天。
