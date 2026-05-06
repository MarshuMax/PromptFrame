# PromptFrame

> [English](README.md)

PromptFrame 是一个 AI 生成图片 Prompt 画廊，用于浏览、搜索、收藏、导入和导出 GPT Image 2 社区作品。基于 Vite、React、TypeScript、Node.js 和 SQLite 构建。

## 功能特性

- 响应式网格视图和列表视图
- 全文搜索（楼层号、用户名、标题、Prompt 关键词）
- 分类筛选（全部/海报/城市/人物/插画/国风），支持自动派生标签和手动标签
- 详情弹窗：大图预览、Prompt 复制、标签管理、相关作品推荐
- 收藏夹、最近搜索、自定义标签（存储在 localStorage）
- 浅色/深色主题切换
- 导出筛选结果为 JSON 文件
- 服务端 SQLite 持久化存储，导入接口支持 Bearer Token 鉴权
- Docker 部署，数据卷持久化

## 快速开始

```bash
npm install
npm run dev
```

Vite 开发服务器启动在 `http://localhost:5173`，`/api/*` 请求代理到 3000 端口的 Node 服务。

## 构建与生产部署

```bash
npm run build
npm run start
```

Express 服务器会同时托管 `dist/` 下的前端静态资源和 API。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | 服务器监听端口 |
| `DATABASE_PATH` | `.data/prompt-frame.sqlite`（开发）/ `/data/prompt-frame.sqlite`（Docker） | SQLite 数据库文件路径 |
| `IMPORT_TOKEN` | （空） | 自定义密钥字符串，作为 `POST /api/import` 的 Bearer Token。可设为任意值（如 `my-secret-123`），导入时将其填入 `Authorization` 请求头即可。留空则导入接口不做鉴权，允许所有请求。 |
| `ADMIN_TOKEN` | `promptframe` | 管理后台密钥字符串，作为管理端 API 的 Bearer Token。用于 `/admin` 登录与管理端接口鉴权。 |

## 管理后台

- 访问路径：`/admin`（开发环境：`http://localhost:5173/admin`；生产环境：`http://localhost:3000/admin` 或 Docker 映射端口）
- 默认管理密钥：`promptframe`（可通过环境变量 `ADMIN_TOKEN` 覆盖）
- 登录后可批量管理作品、单独新增/修改/删除，并支持设置「推荐」与「置顶」

## 导入数据

画廊数据不提交到仓库中，需要通过 API 导入到 SQLite 数据库。

### JSON 格式

导入接口支持以下三种 JSON 结构：

**格式 A — 直接数组：**

```json
[
  {
    "post_number": 42,
    "username": "alice",
    "post_url": "https://example.com/post/42",
    "image_url": "https://example.com/images/42-1.jpg",
    "thumb_url": "https://example.com/thumbs/42-1.jpg",
    "title": "城市夜景",
    "info": "GPT Image 2 生成",
    "prompt": "A futuristic city at night with neon lights...",
    "image_index": 1,
    "recommended": true,
    "pinned": false,
    "original_tags": ["城市", "夜"],
    "user_tags": []
  }
]
```

**格式 B — `items` 包裹：**

```json
{
  "items": [
    {
      "post_number": 42,
      "username": "alice",
      "post_url": "https://example.com/post/42",
      "image_url": "https://example.com/images/42-1.jpg",
      "thumb_url": "https://example.com/thumbs/42-1.jpg",
      "title": "城市夜景",
      "info": "GPT Image 2 生成",
      "prompt": "A futuristic city at night with neon lights...",
      "image_index": 1,
      "recommended": true,
      "pinned": false,
      "original_tags": ["城市", "夜"],
      "user_tags": []
    }
  ]
}
```

**格式 C — `data` 包裹：**

```json
{
  "data": [
    {
      "post_number": 42,
      "username": "alice",
      "post_url": "https://example.com/post/42",
      "image_url": "https://example.com/images/42-1.jpg",
      "thumb_url": "https://example.com/thumbs/42-1.jpg",
      "title": "城市夜景",
      "info": "GPT Image 2 生成",
      "prompt": "A futuristic city at night with neon lights...",
      "image_index": 1,
      "recommended": true,
      "pinned": false,
      "original_tags": ["城市", "夜"],
      "user_tags": []
    }
  ]
}
```

### 字段说明

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `post_number` | **是** | number | 论坛楼层号 |
| `username` | **是** | string | 作者用户名 |
| `image_url` | **是** | string | 原图 URL |
| `thumb_url` | 否 | string | 缩略图 URL（不填则使用 `image_url`） |
| `post_url` | 否 | string | 原帖链接 |
| `title` | 否 | string | 显示标题（不填则自动生成） |
| `info` | 否 | string | 附加信息 |
| `prompt` | 否 | string | AI 提示词文本（不填默认为"未提供"） |
| `image_index` | 否 | number | 该楼层内的图片序号（默认为 1） |
| `recommended` | 否 | boolean | 是否推荐（前台右上角显示推荐角标） |
| `pinned` | 否 | boolean | 是否置顶（排序优先） |
| `original_tags` | 否 | string[] | 原始标签（只读，最多 24 个） |
| `user_tags` | 否 | string[] | 用户自定义标签（可编辑，最多 24 个） |

### 通过 API 导入

```bash
# 未设置 Token 保护
curl -X POST http://localhost:3000/api/import \
  -H "Content-Type: application/json" \
  -d @gallery-data.json

# 设置了 IMPORT_TOKEN 环境变量
curl -X POST http://localhost:3000/api/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -d @gallery-data.json
```

响应示例：

```json
{ "added": 10, "duplicated": 2, "invalid": 1, "total": 10 }
```

- **added** — 新增条目数
- **duplicated** — 重复条目数（已存在的条目会合并标签）
- **invalid** — 缺少必填字段的无效条目数
- **total** — 导入后数据库中的总条目数

重复检测依据组合键 `(image_url, post_number, image_index)`。

### Docker 中导入

```bash
docker compose exec prompt-frame sh -c 'cat > /tmp/data.json' < gallery-data.json
docker compose exec prompt-frame curl -X POST http://localhost:3000/api/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $IMPORT_TOKEN" \
  -d @/tmp/data.json
```

## 导出数据

点击顶部导航栏的**导出**按钮，可将当前筛选结果导出为 JSON 文件。导出的文件可重新导入到任意 PromptFrame 实例中。

## API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/health` | 健康检查 |
| `GET` | `/api/items` | 获取所有画廊条目 |
| `GET` | `/api/categories` | 获取前台分类列表（不含“全部”，按后台排序） |
| `POST` | `/api/import` | 导入条目（若设置了 `IMPORT_TOKEN` 则需 Bearer Token） |
| `POST` | `/api/admin/auth` | 管理端鉴权（Bearer Token：`ADMIN_TOKEN`） |
| `GET` | `/api/admin/items` | 管理端获取作品列表（Bearer Token：`ADMIN_TOKEN`） |
| `POST` | `/api/admin/items` | 管理端新增作品（Bearer Token：`ADMIN_TOKEN`） |
| `PUT` | `/api/admin/items/:id` | 管理端修改作品（Bearer Token：`ADMIN_TOKEN`） |
| `DELETE` | `/api/admin/items/:id` | 管理端删除作品（Bearer Token：`ADMIN_TOKEN`） |
| `PATCH` | `/api/admin/items/batch` | 管理端批量更新推荐/置顶（Bearer Token：`ADMIN_TOKEN`） |
| `POST` | `/api/admin/items/batch-delete` | 管理端批量删除（Bearer Token：`ADMIN_TOKEN`） |
| `GET` | `/api/admin/categories` | 管理端获取分类列表（Bearer Token：`ADMIN_TOKEN`） |
| `POST` | `/api/admin/categories` | 管理端新增分类（Bearer Token：`ADMIN_TOKEN`） |
| `PUT` | `/api/admin/categories/:id` | 管理端更新分类（Bearer Token：`ADMIN_TOKEN`） |
| `DELETE` | `/api/admin/categories/:id` | 管理端删除分类（Bearer Token：`ADMIN_TOKEN`） |
| `POST` | `/api/admin/categories/reorder` | 管理端更新分类排序（Bearer Token：`ADMIN_TOKEN`） |

## Docker 部署

```bash
docker compose up -d --build
```

默认访问 `http://server-ip:8080`。自定义端口：

```bash
PROMPT_FRAME_PORT=3000 docker compose up -d --build
```

导入的画廊数据存储在 `prompt-frame-data` Docker 卷中，重建重启不会丢失。

停止服务：

```bash
docker compose down
```

## 贡献

PR 大小限制、测试报告要求和必需的 GitHub 检查见 [CONTRIBUTING.md](CONTRIBUTING.md)。
