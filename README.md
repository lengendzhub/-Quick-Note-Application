# Quick Note

A calm, tactile, Apple Human Interface Guidelines–inspired single-page note-taking web application built with **Node.js / Express** on the backend and **vanilla HTML, CSS, and JavaScript** (zero build step, zero frontend frameworks) on the frontend.

- **Live Demo:** `https://your-quick-note-app.onrender.com` *(placeholder)*
- **GitHub Repository:** `https://github.com/your-username/quick-note` *(placeholder)*

---

## Overview

Quick Note pairs a lightweight JSON-backed REST API with an uncluttered interface modeled after Apple Notes and iOS: translucent sticky search header, soft layered cards, adaptive Light and Dark modes, optimistic UI updates with automatic rollback, custom Apple-style action sheets and edit sheets, and responsive single-column to 2-column masonry layouts.

---

## Features

- **Create, Read, Update & Delete Notes** — Full REST API (`GET`, `POST`, `PUT`, `DELETE`) backed by serialized async file storage in `data/notes.json`.
- **Optimistic UI with Rollback** — Adding, editing, and deleting notes update the interface instantaneously and cleanly revert with an error toast if the network request fails.
- **Custom Apple-Style Overlays** — Delete confirmation uses a custom iOS-inspired Action Sheet (never `window.confirm`), and clicking any note opens a clean Edit Modal Sheet.
- **Live Client-Side Search** — Instant filtering across titles and note bodies with a clear button and matching note counts.
- **Apple HIG Design System** — SF Pro system typography, Light & Dark mode color tokens (`prefers-color-scheme`), translucent `backdrop-filter` sticky header, `18px` rounded cards, spring-like motion (`cubic-bezier(0.22, 1, 0.36, 1)`), and `prefers-reduced-motion` support.
- **Loading & Empty States** — Shimmer skeleton cards while loading, friendly empty states, relative timestamps (`Just now`, `5 min ago`, `Yesterday`), and auto-growing textareas.
- **Security & Accessibility** — XSS-safe DOM rendering via `textContent`, semantic HTML, ARIA roles/live regions, keyboard navigation (`Cmd/Ctrl + Enter` to save, `Escape` to dismiss), and strict server-side payload validation.

---

## Screenshots

> Add screenshots of your deployed app here.

| Light Mode | Dark Mode |
| --- | --- |
| `![Quick Note Light Mode](./docs/screenshot-light.png)` *(placeholder)* | `![Quick Note Dark Mode](./docs/screenshot-dark.png)` *(placeholder)* |

---

## Project Structure

```text
quick-note/
├── server.js
├── storage.js
├── data/
│   └── notes.json
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── package.json
├── .gitignore
└── README.md
```

---

## API Reference

Base path: `/api`. All requests and responses use JSON. Errors follow `{ "error": "message" }`.

| Method | Endpoint | Description | Request Body | Success Response | Error Codes |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/health` | Service health check | — | `200` `{ status: "ok", timestamp }` | `500` |
| `GET` | `/api/notes` | List all notes, newest first | — | `200` `Note[]` | `500` |
| `POST` | `/api/notes` | Create a new note | `{ title, content }` | `201` `Note` | `400`, `413`, `500` |
| `PUT` | `/api/notes/:id` | Update an existing note | `{ title, content }` | `200` `Note` | `400`, `404`, `413`, `500` |
| `DELETE` | `/api/notes/:id` | Delete a note by ID | — | `200` `{ success: true }` | `404`, `500` |

**Validation rules:** `title` (max 100 characters) and `content` (max 5000 characters) are trimmed; at least one must be non-empty.

**Note object shape:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Design Review",
  "content": "Refine header blur and dark mode contrast.",
  "createdAt": "2026-11-25T14:00:00.000Z",
  "updatedAt": "2026-11-25T14:00:00.000Z"
}
```

---

## Local Setup

### Prerequisites

- **Node.js v18+** (uses built-in `crypto.randomUUID()` and `node --watch`)
- **npm**

### Steps

```bash
# 1. Install dependencies
npm install

# 2. Start in development mode (auto-reloads on file changes)
npm run dev

# Or start in production mode
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deploying to Render

1. Push this repository to GitHub.
2. Sign in to [Render](https://render.com) and click **New + → Web Service**.
3. Connect your GitHub repository.
4. Configure the service:
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment Variables:** Render automatically injects `PORT`; no additional variables are required for local JSON storage.
5. Click **Create Web Service**.

> **Important Note on Free-Tier Persistence:**
> Render's free Web Service tier uses an **ephemeral filesystem**. Any notes saved to `data/notes.json` will be reset whenever the service redeploys, restarts, or spins down due to inactivity. For durable production persistence, swap `storage.js` for a managed database (below).

---

## Swapping `storage.js` for a Database

All persistence logic is isolated inside `storage.js`, which exports five async functions:

- `ensureStorageFile()`
- `getAllNotes()`
- `createNote({ title, content })`
- `updateNote(id, { title, content })`
- `deleteNote(id)`

Because `server.js` only calls those functions, you can replace `storage.js` without touching any route handlers or frontend code:

### Option A: SQLite (`better-sqlite3` or `sqlite` + `sqlite3`)

1. Install `better-sqlite3` (or attach a Render Persistent Disk mounted at `/var/data`).
2. Create a `notes` table `(id TEXT PRIMARY KEY, title TEXT, content TEXT, createdAt TEXT, updatedAt TEXT)`.
3. Implement `getAllNotes`, `createNote`, `updateNote`, and `deleteNote` using prepared SQL statements (`ORDER BY createdAt DESC`).

### Option B: MongoDB Atlas (`mongodb` or `mongoose`)

1. Provision a free M0 cluster on [MongoDB Atlas](https://www.mongodb.com/atlas) and set `MONGODB_URI` in Render's Environment Variables.
2. In `storage.js`, connect a `MongoClient` inside `ensureStorageFile()` and point to `db.collection('notes')`.
3. Map `_id` or store `id: crypto.randomUUID()` as a field, sort `getAllNotes()` by `{ createdAt: -1 }`, and perform `insertOne`, `findOneAndUpdate`, and `deleteOne` in the respective exported methods.

