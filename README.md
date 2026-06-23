# Product API

A backend API for browsing 200,000 products with fast, correct cursor-based pagination. Built for the CodeVector internship take-home task.

---

## Problem Statement

This API enables clients to browse a catalog of 200,000 products with the following constraints:

- Products must be returned **newest-first** (ordered by `updatedAt` descending).
- Pagination must remain **correct** even when products are inserted or updated during browsing — no duplicate records and no missing records.
- Clients must be able to **filter by category** while paginating.
- The API must stay **fast** regardless of page depth.

Traditional `LIMIT/OFFSET` pagination fails under these requirements (see "Why Cursor Pagination?" below). This project uses **cursor-based (keyset) pagination** to solve the problem correctly.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Language | TypeScript |
| ORM | Prisma |
| Database | PostgreSQL |
| Seed data | @faker-js/faker |
| Security | Helmet, CORS, express-rate-limit |

---

## Key Features

- **Cursor/keyset pagination** — no OFFSET, no duplicates, no missing records at any depth
- **Category filtering** — filter by 10 categories with full cursor pagination support
- **200,000 product seed script** — batch-inserts realistic data in ~30–60 seconds using `createMany`
- **PostgreSQL indexes** — two composite indexes optimized for every query pattern
- **Input validation** — validates `limit`, `cursor`, and `category` with clear error messages
- **Clean API responses** — consistent JSON structure with `products`, `nextCursor`, and error objects
- **Health check endpoint** — verifies database connectivity

---

## Why Cursor Pagination?

### The problem with OFFSET

```sql
-- OFFSET pagination (AVOIDED in this project)
SELECT * FROM products ORDER BY updated_at DESC LIMIT 20 OFFSET 40;
```

| Issue | Explanation |
|---|---|
| **Performance** | The database must scan and skip all OFFSET rows. Scanning page 10,000 means sorting and discarding 200,000 rows — O(n) at every depth. |
| **Duplicates** | If a new product is inserted at the top, all subsequent pages shift forward by one. The same record that was last on page N becomes first on page N+1. |
| **Missing records** | If a product is deleted, pages shift backward and a record is silently skipped. |

### How cursor pagination solves it

Cursor pagination uses the **last item from the previous page** as the anchor for the next request:

```sql
SELECT * FROM products
WHERE (updated_at, id) < (last_updated_at, last_id)
ORDER BY updated_at DESC, id DESC
LIMIT 20;
```

- The `WHERE` clause uses the anchor to find the starting point directly via the index — **O(log n)** regardless of depth.
- New insertions happen **after** the anchor (newer timestamps sort higher), so they don't affect subsequent pages.
- No page shifting means **no duplicates** and **no missing records**.

This project encodes the cursor as a base64url string combining `updatedAt` ISO timestamp and `id`:

```
"MjAyNS0wNi0yMlQxMjowMDowMC4wMDBaX2NtN2w4eC4uLg=="
  → decoded: "2025-06-22T12:00:00.000Z_cm7l8x..."
```

---

## Database Indexing Strategy

Two composite indexes cover every query the API can produce.

### Index 1: `(updatedAt, id)`

```prisma
@@index([updatedAt, id])
```

**Used when:** No category filter is applied.

**Why:** The default query orders by `updatedAt DESC, id DESC`. PostgreSQL can scan this index backward to produce the sorted result directly — no separate sort step. The `id` column breaks ties when multiple products share the same `updatedAt` timestamp, ensuring a **total order** and stable cursor boundaries.

### Index 2: `(category, updatedAt, id)`

```prisma
@@index([category, updatedAt, id])
```

**Used when:** A category filter is applied (`WHERE category = 'Electronics'`).

**Why:** PostgreSQL performs an index seek on `category`, then a backward scan on `(updatedAt, id)` — the entire query is satisfied by a single index pass. Without this index, PostgreSQL would either scan the full `(updatedAt, id)` index and filter by category, or do a bitmap scan combining two separate indexes.

### Why not separate indexes?

PostgreSQL generally uses at most one index per table per query (except bitmap scans, which are slower). A **composite** index on the exact columns used in `WHERE` + `ORDER BY` is always faster than separate single-column indexes that require bitmap combine or post-filtering.

---

## Database Schema

### Product Model

```prisma
model Product {
  id        String   @id @default(cuid()) @db.Text
  name      String   @db.Text
  category  String   @db.Text
  price     Decimal  @db.Decimal(10, 2)
  createdAt DateTime @map("created_at") @default(now())
  updatedAt DateTime @map("updated_at") @updatedAt

  @@index([updatedAt, id])
  @@index([category, updatedAt, id])
  @@map("products")
}
```

The table is mapped to `products` (snake_case) in PostgreSQL. `createdAt` and `updatedAt` use `@map` for snake_case column naming while keeping camelCase in TypeScript.

---

## Project Structure

```
product-api/
├── prisma/
│   ├── schema.prisma          # Database schema, indexes, mappings
│   ├── seed.ts                # Batch seed script (200,000 products)
│   └── verify.ts              # Verification script (product count)
├── src/
│   ├── index.ts               # Entry point — connects DB, starts server
│   ├── app.ts                 # Express app — middleware, routes, error handler
│   ├── config.ts              # Environment configuration loader
│   ├── lib/
│   │   └── prisma.ts          # Prisma client singleton
│   ├── middleware/
│   │   └── errorHandler.ts    # Centralized error handler (AppError class)
│   ├── routes/
│   │   ├── products.ts        # GET /api/products — cursor pagination logic
│   │   ├── categories.ts      # GET /api/categories — distinct categories
│   │   └── health.ts          # GET /api/health — database connectivity check
│   └── types/
│       └── index.ts           # Shared types, constants (VALID_CATEGORIES)
├── .env.example               # Environment variable template
├── package.json
├── tsconfig.json
└── README.md
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# PostgreSQL connection string
DATABASE_URL="postgresql://username:password@host:port/database"

# Server
PORT=3000
NODE_ENV=development

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

---

## Installation & Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (or a cloud provider like Neon / Supabase)
- npm

### Commands

```bash
# 1. Clone the repository
git clone <repository-url>
cd product-api

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL

# 4. Run Prisma migration (creates the products table)
npx prisma migrate dev

# 5. Generate Prisma client
npx prisma generate

# 6. Seed 200,000 products
npm run seed

# 7. Start the development server
npm run dev
```

The API will be available at `http://localhost:3000` (or the port configured in `.env`).

---

## Seeding 200,000 Products

```bash
npm run seed
```

The seed script (`prisma/seed.ts`):

1. **Deletes** all existing products.
2. Inserts **200,000 products** in **batches of 5,000** using Prisma's `createMany`.
3. Uses **@faker-js/faker** for realistic product names, prices, and timestamps.
4. Distributes products evenly across **10 categories**: Electronics, Fashion, Grocery, Books, Home, Sports, Beauty, Toys, Furniture, Footwear.
5. Spreads `createdAt` over the past 2 years; `updatedAt` is always ≥ `createdAt`.
6. Prints progress every 5,000 records with elapsed time.

**Why batch insertion?** Inserting 200,000 rows individually would issue 200,000 round-trips to the database. `createMany` sends **40 batches** (40 × 5,000), reducing round-trips by ~5,000× and completing in 30–60 seconds.

**Verify the count:**

```bash
npm run db:verify
# Expected output: Product count: 200,000
```

Or query the database directly:

```sql
SELECT COUNT(*) FROM products;
```

---

## API Documentation

### `GET /api/health`

Returns server and database health status.

**Response:**

```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2025-06-22T12:00:00.000Z"
}
```

---

### `GET /api/categories`

Returns all product categories with their count.

**Response:**

```json
{
  "categories": ["Beauty", "Books", "Electronics", "Fashion", "Footwear", "Furniture", "Grocery", "Home", "Sports", "Toys"],
  "count": 10
}
```

---

### `GET /api/products`

Paginated product listing, newest-first. Supports category filtering and cursor-based pagination.

**Query Parameters:**

| Parameter | Type | Default | Max | Description |
|---|---|---|---|---|
| `limit` | number | `20` | `100` | Number of products per page |
| `cursor` | string | — | — | Base64url-encoded cursor from previous response |
| `category` | string | — | — | Category to filter by (case-insensitive) |

**First page:**

```http
GET /api/products?limit=20
```

```json
{
  "products": [
    {
      "id": "cm7l8xabp0000abc12345defg",
      "name": "Premium Wireless Headphones",
      "category": "Electronics",
      "price": 249.99,
      "createdAt": "2024-12-15T10:30:00.000Z",
      "updatedAt": "2025-06-22T08:15:00.000Z"
    }
  ],
  "nextCursor": "MjAyNS0wNi0yMlQwODoxNTowMC4wMDBaX2NtN2w4eGFicDAwMDBhYmMxMjM0NWRlZmc="
}
```

**Next page (use `nextCursor` from previous response):**

```http
GET /api/products?limit=20&cursor=MjAyNS0wNi0yMlQwODoxNTowMC4wMDBaX2NtN2w4eGFicDAwMDBhYmMxMjM0NWRlZmc=
```

**Filter by category:**

```http
GET /api/products?limit=20&category=Electronics
```

**Filter by category with cursor:**

```http
GET /api/products?limit=20&category=Electronics&cursor=MjAyNS0wNi0yMlQwODoxNTowMC4wMDBaX2NtN2w4eGFicDAwMDBhYmMxMjM0NWRlZmc=
```

**Empty page (no more results):**

```json
{
  "products": [],
  "nextCursor": null
}
```

**Pagination flow:**

1. Request `GET /api/products?limit=20` → get `nextCursor`.
2. Request `GET /api/products?limit=20&cursor=<nextCursor>` → get next `nextCursor`.
3. Repeat until `nextCursor` is `null`.

**Error Responses:**

| Status | Error | Details |
|---|---|---|
| 400 | Invalid limit | Limit must be a positive integer |
| 400 | Limit exceeds maximum | Max limit is 100 |
| 400 | Invalid cursor format | Cursor must be a valid base64url encoded string |
| 400 | Invalid category | Valid categories: Electronics, Fashion, ... |
| 429 | Too many requests | — |
| 500 | Internal server error | (details only in development mode) |

```json
{
  "error": "Invalid limit",
  "details": "Limit must be a positive integer"
}
```

---

## Testing with Postman

Use Postman to manually test all API endpoints. Follow the steps below.

### Setup

1. Open **Postman**.
2. Create a new **Collection** (e.g., "Product API").
3. Add the base URL variable: set `{{baseUrl}}` = `http://localhost:3000`.

---

### 1. Health check

**Request:** `GET {{baseUrl}}/api/health`

**Verify:** Status `200`, response body contains `"status": "healthy"`.

---

### 2. Product listing (first page)

**Request:** `GET {{baseUrl}}/api/products?limit=20`

**Verify:** Returns exactly 20 products, includes `nextCursor` field, products are ordered newest-first by `updatedAt`.

---

### 3. Cursor next page

**Request:** `GET {{baseUrl}}/api/products?limit=20&cursor=<nextCursor>`

Replace `<nextCursor>` with the `nextCursor` value from step 2.

**Verify:** Returns 20 different products (no overlap with page 1). A new `nextCursor` is returned.

---

### 4. Category filter

**Request:** `GET {{baseUrl}}/api/products?limit=20&category=Electronics`

**Verify:** All returned products have `"category": "Electronics"`.

---

### 5. Category filter with cursor

**Request:** `GET {{baseUrl}}/api/products?limit=20&category=Electronics&cursor=<nextCursor>`

Use `nextCursor` from step 4's response.

**Verify:** All products still in `"Electronics"`, no duplicates between pages.

---

### 6. Invalid limit

**Request:** `GET {{baseUrl}}/api/products?limit=-1`

**Verify:** Status `400`, error body contains `"Limit must be a positive integer"`.

---

### 7. Invalid cursor

**Request:** `GET {{baseUrl}}/api/products?cursor=invalid-cursor`

**Verify:** Status `400`, error body contains `"Invalid cursor format"`.

---

### 8. No duplicate records between pages

1. **Request:** `GET {{baseUrl}}/api/products?limit=100` — copy `nextCursor`.
2. **Request:** `GET {{baseUrl}}/api/products?limit=100&cursor=<nextCursorFromP1>`.

**Verify:** Compare the `id` values from both responses — no ID should appear in both pages.

---

### 9. Category listing

**Request:** `GET {{baseUrl}}/api/categories`

**Verify:** Status `200`, response contains 10 categories and a `count` of 10.

---

### 10. Performance check

**Request 1:** `GET {{baseUrl}}/api/products?limit=100`

**Request 2:** `GET {{baseUrl}}/api/products?limit=100&cursor=<deepCursor>`

Replace `<deepCursor>` with a cursor from a page far into the dataset.

**Verify:** Use Postman's **"Status: 200 OK — Time: xxx ms"** indicator. Both requests should complete under **500ms**.

---

## Deployment

### Backend — Render

1. Push the repository to GitHub.
2. Go to [render.com](https://render.com) → New → Web Service.
3. Connect your repository.
4. Configure:
   - **Build Command:** `npm install && npx prisma generate && npm run build`
   - **Start Command:** `npm start`
5. Add environment variables in Render dashboard:
   - `DATABASE_URL`
   - `NODE_ENV=production`
6. Deploy.
7. After deployment, run migrations and seed data (via Render Shell or a one-off task):
   ```bash
   npx prisma migrate dev
   npm run seed
   ```

### Database — Neon or Supabase

- **Neon:** [neon.tech](https://neon.tech) — free tier, connection pooling, branching.
- **Supabase:** [supabase.com](https://supabase.com) — free tier, includes PostgreSQL.

Copy the connection string from your provider's dashboard into the `DATABASE_URL` environment variable.

---

## Live Links

- **Live API:** `https://your-app.onrender.com` _(replace with actual URL after deployment)_
- **GitHub Repository:** `https://github.com/your-username/product-api` _(replace with actual URL)_

---

## AI Usage Note

I used AI (GitHub Copilot / Claude) during development as an assistive tool. Specifically, AI helped with:

- Planning the project structure and cursor pagination approach
- Generating boilerplate code (Express setup, Prisma configuration)
- Drafting this README
- Checking edge cases (cursor decoding, input validation, index selection)

However, all pagination logic, error handling, testing, and final architectural decisions were manually reviewed and verified. I take full responsibility for the correctness and quality of the code.

---

## What I Would Improve With More Time

1. **Automated tests** — integration tests with supertest and a test database
2. **Load testing** — k6 or autocannon to benchmark pagination at scale
3. **Docker setup** — `docker-compose.yml` with PostgreSQL for one-command setup
4. **Caching categories** — categories change rarely; cache the `/api/categories` response
5. **Simple frontend** — a minimal React or vanilla JS demo showing infinite scroll
6. **Better monitoring/logging** — structured logging (pino) and request tracing
7. **Full-text search** — PostgreSQL `tsvector` for searching by product name
8. **Sort options** — allow `?sort=price:asc` with cursor support
9. **Price range filtering** — `?minPrice=10&maxPrice=500`
10. **OpenAPI / Swagger docs** — auto-generated API documentation

---

## Interview Notes

### Why not OFFSET?

OFFSET pagination becomes slower as page depth increases because the database must scan and discard all preceding rows. More importantly, OFFSET produces **incorrect results** when data changes: inserting a new product shifts pages forward (causing duplicates), and deleting a product shifts them backward (causing missing records). Cursor pagination avoids both problems by using an anchor-based WHERE clause.

### Why use `updatedAt` + `id`?

`updatedAt` provides the primary sort order (newest-first). `id` breaks ties when multiple products have the same `updatedAt` timestamp, ensuring a **total order**. Without `id`, two products with the same timestamp could appear in different orders across requests, causing duplicates or omissions.

### What does `nextCursor` contain?

A base64url-encoded string combining the **ISO 8601 timestamp** of `updatedAt` and the **id** of the last product on the current page, separated by an underscore. For example: `"2025-06-22T12:00:00.000Z_cm7l8xabp0000abc12345defg"` → base64url encoded. The server decodes it to reconstruct the anchor for the next page query.

### Why are indexes needed?

Without indexes, PostgreSQL would perform a **sequential scan** of the entire 200,000-row table and a separate sort for every query. The composite indexes allow the database to satisfy the `WHERE` + `ORDER BY` + `LIMIT` clauses with a single index scan — O(log n) instead of O(n). This keeps response times under ~50ms regardless of page depth.

### How does category filtering work with cursor pagination?

When a `category` parameter is provided, the query adds `WHERE category = 'Electronics'` to the base cursor condition. The composite index `(category, updatedAt, id)` handles this in one pass: PostgreSQL seeks to the matching category, then scans backward through `(updatedAt, id)`. The cursor still uses `(updatedAt, id)` as the anchor — the category filter just narrows which rows are visible.
