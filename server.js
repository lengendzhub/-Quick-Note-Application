'use strict';

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const storage = require('./storage');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

const MAX_TITLE_LENGTH = 100;
const MAX_CONTENT_LENGTH = 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '64kb' }));

/**
 * Validates and normalizes incoming note payloads for POST and PUT requests.
 * At least one of title or content must be non-empty after trimming.
 */
function validateNotePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object.' };
  }

  const rawTitle = body.title === undefined || body.title === null ? '' : body.title;
  const rawContent = body.content === undefined || body.content === null ? '' : body.content;

  if (typeof rawTitle !== 'string' || typeof rawContent !== 'string') {
    return { error: 'Title and content must be strings.' };
  }

  const title = rawTitle.trim();
  const content = rawContent.trim();

  if (!title && !content) {
    return { error: 'Please provide a title or note content.' };
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return { error: `Title cannot exceed ${MAX_TITLE_LENGTH} characters.` };
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return { error: `Content cannot exceed ${MAX_CONTENT_LENGTH} characters.` };
  }

  return { title, content };
}

/**
 * Wraps async route handlers and forwards rejections to Express error middleware.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// GET /api/notes - Retrieve all notes, newest first
app.get(
  '/api/notes',
  asyncHandler(async (req, res) => {
    const notes = await storage.getAllNotes();
    res.status(200).json(notes);
  })
);

// POST /api/notes - Create a new note
app.post(
  '/api/notes',
  asyncHandler(async (req, res) => {
    const result = validateNotePayload(req.body);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    const created = await storage.createNote(result);
    return res.status(201).json(created);
  })
);

// PUT /api/notes/:id - Update an existing note
app.put(
  '/api/notes/:id',
  asyncHandler(async (req, res) => {
    const result = validateNotePayload(req.body);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    const updated = await storage.updateNote(req.params.id, result);
    if (!updated) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    return res.status(200).json(updated);
  })
);

// DELETE /api/notes/:id - Delete a note by ID
app.delete(
  '/api/notes/:id',
  asyncHandler(async (req, res) => {
    const deleted = await storage.deleteNote(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    return res.status(200).json({ success: true });
  })
);

// 404 handler for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// Serve static frontend assets from /public
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// Fallback to index.html for unknown non-API GET requests
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Global error-handling middleware
app.use((err, req, res, _next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }

  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request payload is too large.' });
  }

  console.error('[Quick Note Error]', err);
  return res.status(500).json({ error: 'Internal server error.' });
});

// Initialize storage and start server
storage
  .ensureStorageFile()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Quick Note server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize storage:', err);
    process.exit(1);
  });

