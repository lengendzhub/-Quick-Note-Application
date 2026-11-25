'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, 'data');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');

/**
 * Promise-chain mutex that serializes all read-modify-write operations
 * so concurrent requests cannot interleave and corrupt data/notes.json.
 */
let operationQueue = Promise.resolve();

function enqueue(task) {
  const next = operationQueue.then(task, task);
  // Keep the queue alive even if an individual task rejects.
  operationQueue = next.catch(() => {});
  return next;
}

/**
 * Ensures the data directory and notes.json file exist on disk.
 * Automatically creates an empty JSON array file if missing.
 */
async function ensureStorageFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(NOTES_FILE);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(NOTES_FILE, '[]\n', 'utf8');
      return;
    }
    throw err;
  }
}

/**
 * Reads and parses all notes from disk.
 * @returns {Promise<Array<object>>}
 */
async function readNotesFile() {
  await ensureStorageFile();
  const raw = await fs.readFile(NOTES_FILE, 'utf8');
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error('Corrupted storage: notes.json must contain a JSON array.');
  }
  return parsed;
}

/**
 * Persists the notes array atomically via a temporary file rename when possible,
 * falling back to a direct write if cross-device/lock constraints occur.
 * @param {Array<object>} notes
 */
async function writeNotesFile(notes) {
  await ensureStorageFile();
  const payload = JSON.stringify(notes, null, 2) + '\n';
  const tempFile = `${NOTES_FILE}.${process.pid}.${Date.now()}.tmp`;

  try {
    await fs.writeFile(tempFile, payload, 'utf8');
    await fs.rename(tempFile, NOTES_FILE);
  } catch (err) {
    // Clean up temp file if rename failed, then fall back to direct write.
    await fs.unlink(tempFile).catch(() => {});
    if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EXDEV') {
      await fs.writeFile(NOTES_FILE, payload, 'utf8');
    } else {
      throw err;
    }
  }
}

/**
 * Returns all notes sorted newest-first by createdAt timestamp.
 * @returns {Promise<Array<object>>}
 */
async function getAllNotes() {
  return enqueue(async () => {
    const notes = await readNotesFile();
    return [...notes].sort((a, b) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return Number.isNaN(diff) ? 0 : diff;
    });
  });
}

/**
 * Creates and persists a new note.
 * @param {{ title: string, content: string }} data
 * @returns {Promise<object>}
 */
async function createNote({ title, content }) {
  return enqueue(async () => {
    const notes = await readNotesFile();
    const now = new Date().toISOString();
    const newNote = {
      id: crypto.randomUUID(),
      title,
      content,
      createdAt: now,
      updatedAt: now
    };
    notes.unshift(newNote);
    await writeNotesFile(notes);
    return newNote;
  });
}

/**
 * Updates an existing note by ID.
 * @param {string} id
 * @param {{ title: string, content: string }} data
 * @returns {Promise<object|null>} Updated note, or null if not found.
 */
async function updateNote(id, { title, content }) {
  return enqueue(async () => {
    const notes = await readNotesFile();
    const index = notes.findIndex((note) => note.id === id);
    if (index === -1) {
      return null;
    }

    const updatedNote = {
      ...notes[index],
      title,
      content,
      updatedAt: new Date().toISOString()
    };
    notes[index] = updatedNote;
    await writeNotesFile(notes);
    return updatedNote;
  });
}

/**
 * Deletes a note by ID.
 * @param {string} id
 * @returns {Promise<boolean>} True if deleted, false if not found.
 */
async function deleteNote(id) {
  return enqueue(async () => {
    const notes = await readNotesFile();
    const nextNotes = notes.filter((note) => note.id !== id);
    if (nextNotes.length === notes.length) {
      return false;
    }
    await writeNotesFile(nextNotes);
    return true;
  });
}

module.exports = {
  ensureStorageFile,
  getAllNotes,
  createNote,
  updateNote,
  deleteNote
};

