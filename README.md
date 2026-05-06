# PromptFrame

> [中文文档](README_CN.md)

PromptFrame is a gallery for browsing, searching, collecting, importing, and exporting AI-generated image prompts (GPT Image 2 community). Built with Vite, React, TypeScript, Node.js, and SQLite.

## Features

- Responsive grid and list views
- Full-text search across post numbers, usernames, titles, and prompts
- Category filters (全部/海报/城市/人物/插画/国风) with auto-derived and manual tags
- Detail modal with full-size image, prompt copy, tag management, and related works
- Favorites, recent searches, and custom user tags persisted in localStorage
- Light / dark theme toggle
- Export filtered results as JSON
- Server-side SQLite persistence with Bearer token-protected import API
- Docker support with persistent data volume

## Quick Start

```bash
npm install
npm run dev
```

Opens the Vite dev server on `http://localhost:5173`. `/api/*` requests are proxied to the Node server on port 3000.

## Build & Production

```bash
npm run build
npm run start
```

The Express server serves both the built frontend from `dist/` and the API.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `DATABASE_PATH` | `.data/prompt-frame.sqlite` (dev) / `/data/prompt-frame.sqlite` (Docker) | SQLite file path |
| `IMPORT_TOKEN` | (empty) | A self-defined secret string used as Bearer token for `POST /api/import`. Set it to any value you choose (e.g. `my-secret-123`), then include it in the `Authorization` header when calling the import endpoint. If left empty, the import endpoint accepts all requests without authentication. |

## Importing Data

Gallery data is not committed to this repository. Import data into the SQLite database via the API.

### JSON Format

The import endpoint accepts **any** of these JSON structures:

**Format A — array of items:**

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
    "original_tags": ["城市", "夜"],
    "user_tags": []
  }
]
```

**Format B — object with `items` field:**

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
      "original_tags": ["城市", "夜"],
      "user_tags": []
    }
  ]
}
```

**Format C — object with `data` field:**

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
      "original_tags": ["城市", "夜"],
      "user_tags": []
    }
  ]
}
```

### Supported Fields

| Field | Required | Type | Description |
|---|---|---|---|
| `post_number` | **Yes** | number | Forum post / floor number |
| `username` | **Yes** | string | Author username |
| `image_url` | **Yes** | string | Full-size image URL |
| `thumb_url` | no | string | Thumbnail URL (falls back to `image_url`) |
| `post_url` | no | string | Link to original post |
| `title` | no | string | Display title (auto-generated if empty) |
| `info` | no | string | Additional info |
| `prompt` | no | string | The AI prompt text (defaults to "未提供") |
| `image_index` | no | number | Image sequence within the post (defaults to 1) |
| `original_tags` | no | string[] | Read-only tags (max 24) |
| `user_tags` | no | string[] | Editable user tags (max 24) |

### Import via API

```bash
# Without token protection
curl -X POST http://localhost:3000/api/import \
  -H "Content-Type: application/json" \
  -d @gallery-data.json

# With token protection (set IMPORT_TOKEN in env)
curl -X POST http://localhost:3000/api/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -d @gallery-data.json
```

The response includes counts:

```json
{ "added": 10, "duplicated": 2, "invalid": 1, "total": 10 }
```

- **added** — newly inserted items
- **duplicated** — items that already exist (their tags are merged with existing ones)
- **invalid** — entries missing required fields
- **total** — total items in the database after import

Duplicates are detected by the composite key `(image_url, post_number, image_index)`.

### Import in Docker

```bash
docker compose exec prompt-frame sh -c 'cat > /tmp/data.json' < gallery-data.json
docker compose exec prompt-frame curl -X POST http://localhost:3000/api/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $IMPORT_TOKEN" \
  -d @/tmp/data.json
```

## Exporting Data

Click the **导出** button in the top bar to export the currently filtered results as a JSON file. The exported file can be re-imported into any PromptFrame instance.

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/items` | List all gallery items |
| `POST` | `/api/import` | Import items (Bearer token required if `IMPORT_TOKEN` is set) |

## Docker Deployment

```bash
docker compose up -d --build
```

Opens on `http://server-ip:8080`. Use a custom port:

```bash
PROMPT_FRAME_PORT=3000 docker compose up -d --build
```

Imported gallery data is stored in the `prompt-frame-data` Docker volume and survives container rebuilds and restarts.

To stop:

```bash
docker compose down
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for PR size limits, required test reports, and required GitHub checks.
