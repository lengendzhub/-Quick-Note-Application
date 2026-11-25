(() => {
  'use strict';

  const API_BASE = '/api';
  const MAX_TITLE_LENGTH = 100;
  const MAX_CONTENT_LENGTH = 5000;
  const TOAST_DURATION_MS = 3400;
  const DELETE_ANIMATION_MS = 260;
  const MASONRY_QUERY = '(min-width: 900px)';

  // Application state
  const state = {
    notes: [],
    searchQuery: '',
    isLoading: true,
    isSubmitting: false,
    isSavingEdit: false,
    pendingDeleteId: null,
    editingNoteId: null,
    lastFocusedElement: null
  };

  let toastTimer = null;
  let toastHideTimer = null;

  // DOM References
  const dom = {
    notesCount: document.getElementById('notes-count'),
    searchInput: document.getElementById('search-input'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    composerForm: document.getElementById('composer-form'),
    noteTitle: document.getElementById('note-title'),
    noteContent: document.getElementById('note-content'),
    composerMeta: document.getElementById('composer-meta'),
    addNoteBtn: document.getElementById('add-note-btn'),
    addNoteLabel: document.getElementById('add-note-label'),
    skeletonLoader: document.getElementById('skeleton-loader'),
    emptyState: document.getElementById('empty-state'),
    searchEmptyState: document.getElementById('search-empty-state'),
    resetSearchBtn: document.getElementById('reset-search-btn'),
    errorState: document.getElementById('error-state'),
    errorStateMessage: document.getElementById('error-state-message'),
    retryLoadBtn: document.getElementById('retry-load-btn'),
    notesContainer: document.getElementById('notes-container'),

    // Delete Action Sheet
    deleteSheetBackdrop: document.getElementById('delete-sheet-backdrop'),
    deleteSheetDesc: document.getElementById('delete-sheet-desc'),
    confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
    cancelDeleteBtn: document.getElementById('cancel-delete-btn'),

    // Edit Modal Sheet
    editModalBackdrop: document.getElementById('edit-modal-backdrop'),
    editForm: document.getElementById('edit-form'),
    editCancelBtn: document.getElementById('edit-cancel-btn'),
    editSaveBtn: document.getElementById('edit-save-btn'),
    editTitleInput: document.getElementById('edit-note-title'),
    editContentInput: document.getElementById('edit-note-content'),
    editModalMeta: document.getElementById('edit-modal-meta'),

    // Toast
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toast-message')
  };

  const masonryMedia = window.matchMedia(MASONRY_QUERY);
  const reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ------------------------------------------------------------------------
     API Helpers
     ------------------------------------------------------------------------ */

  async function apiRequest(endpoint, options = {}) {
    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        },
        ...options
      });
    } catch (_networkErr) {
      throw new Error('Unable to reach the server. Check your connection.');
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (_parseErr) {
      payload = null;
    }

    if (!response.ok) {
      const message =
        payload && typeof payload.error === 'string'
          ? payload.error
          : `Request failed (${response.status})`;
      throw new Error(message);
    }

    return payload;
  }

  /* ------------------------------------------------------------------------
     Utilities: Formatting & Auto-Grow
     ------------------------------------------------------------------------ */

  function isSameCalendarDay(a, b) {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  function formatRelativeTime(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 45) {
      return 'Just now';
    }

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      return `${diffMinutes} min ago`;
    }

    if (isSameCalendarDay(date, now)) {
      const diffHours = Math.floor(diffMinutes / 60);
      return `${diffHours} hr ago`;
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (isSameCalendarDay(date, yesterday)) {
      return 'Yesterday';
    }

    const diffDays = Math.floor(diffSeconds / 86400);
    if (diffDays < 7) {
      return date.toLocaleDateString(undefined, { weekday: 'long' });
    }

    const sameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      ...(sameYear ? {} : { year: 'numeric' })
    });
  }

  function formatFullTimestamp(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

  function autoGrowTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function createTrashIconSvg() {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');

    const paths = [
      'M4 7h16',
      'M9 7V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V7',
      'M6.5 7l1 12.2A2 2 0 0 0 9.5 21h5a2 2 0 0 0 2-1.8L17.5 7',
      'M10 11.5v5',
      'M14 11.5v5'
    ];

    for (const d of paths) {
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('stroke-width', '1.8');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(path);
    }
    return svg;
  }

  /* ------------------------------------------------------------------------
     Toast Notifications
     ------------------------------------------------------------------------ */

  function showToast(message, type = 'success') {
    clearTimeout(toastTimer);
    clearTimeout(toastHideTimer);

    dom.toast.classList.toggle('is-error', type === 'error');
    dom.toastMessage.textContent = message;
    dom.toast.hidden = false;

    // Force layout before adding visible class for smooth entry transition
    void dom.toast.offsetWidth;
    dom.toast.classList.add('is-visible');

    toastTimer = setTimeout(() => {
      dom.toast.classList.remove('is-visible');
      toastHideTimer = setTimeout(() => {
        dom.toast.hidden = true;
      }, 280);
    }, TOAST_DURATION_MS);
  }

  /* ------------------------------------------------------------------------
     Composer Logic
     ------------------------------------------------------------------------ */

  function updateComposerState() {
    const titleVal = dom.noteTitle.value.trim();
    const contentVal = dom.noteContent.value.trim();
    const hasInput = titleVal.length > 0 || contentVal.length > 0;

    dom.addNoteBtn.disabled = !hasInput || state.isSubmitting;
    dom.addNoteLabel.textContent = state.isSubmitting ? 'Adding…' : 'Add Note';

    const titleLen = dom.noteTitle.value.length;
    const contentLen = dom.noteContent.value.length;

    if (contentLen >= 4500 || titleLen >= 80) {
      dom.composerMeta.classList.toggle(
        'is-warning',
        contentLen >= MAX_CONTENT_LENGTH || titleLen >= MAX_TITLE_LENGTH
      );
      dom.composerMeta.textContent =
        titleLen >= 80
          ? `Title ${titleLen}/${MAX_TITLE_LENGTH} · Body ${contentLen}/${MAX_CONTENT_LENGTH}`
          : `${contentLen}/${MAX_CONTENT_LENGTH} characters`;
    } else {
      dom.composerMeta.classList.remove('is-warning');
      if (!dom.composerMeta.querySelector('.kbd-hint')) {
        dom.composerMeta.textContent = '';
        const kbd1 = document.createElement('kbd');
        kbd1.className = 'kbd-hint';
        kbd1.textContent = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';
        const plus = document.createElement('span');
        plus.className = 'kbd-plus';
        plus.textContent = '+';
        const kbd2 = document.createElement('kbd');
        kbd2.className = 'kbd-hint';
        kbd2.textContent = '↵';
        const label = document.createElement('span');
        label.className = 'kbd-label';
        label.textContent = 'to add';
        dom.composerMeta.append(kbd1, plus, kbd2, label);
      }
    }
  }

  async function handleComposerSubmit(event) {
    event.preventDefault();
    if (state.isSubmitting) {
      return;
    }

    const title = dom.noteTitle.value.trim();
    const content = dom.noteContent.value.trim();

    if (!title && !content) {
      updateComposerState();
      return;
    }

    if (title.length > MAX_TITLE_LENGTH) {
      showToast(`Title cannot exceed ${MAX_TITLE_LENGTH} characters.`, 'error');
      return;
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      showToast(`Content cannot exceed ${MAX_CONTENT_LENGTH} characters.`, 'error');
      return;
    }

    // Capture raw inputs for rollback if request fails
    const previousTitle = dom.noteTitle.value;
    const previousContent = dom.noteContent.value;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();

    const optimisticNote = {
      id: tempId,
      title,
      content,
      createdAt: nowIso,
      updatedAt: nowIso,
      _pending: true
    };

    state.isSubmitting = true;
    state.notes.unshift(optimisticNote);

    dom.noteTitle.value = '';
    dom.noteContent.value = '';
    dom.noteContent.style.height = 'auto';
    updateComposerState();
    render({ animateId: tempId });

    try {
      const savedNote = await apiRequest('/notes', {
        method: 'POST',
        body: JSON.stringify({ title, content })
      });

      const index = state.notes.findIndex((n) => n.id === tempId);
      if (index !== -1) {
        state.notes[index] = savedNote;
      }
      render();
      showToast('Note added');
    } catch (err) {
      // Rollback optimistic insert and restore user's draft
      state.notes = state.notes.filter((n) => n.id !== tempId);
      dom.noteTitle.value = previousTitle;
      dom.noteContent.value = previousContent;
      autoGrowTextarea(dom.noteContent);
      render();
      showToast(err.message || 'Could not save note.', 'error');
    } finally {
      state.isSubmitting = false;
      updateComposerState();
    }
  }

  /* ------------------------------------------------------------------------
     Filtering & Rendering (Safe DOM construction, zero XSS)
     ------------------------------------------------------------------------ */

  function getFilteredNotes() {
    const query = state.searchQuery.trim().toLowerCase();
    if (!query) {
      return state.notes;
    }
    return state.notes.filter(
      (note) =>
        (note.title && note.title.toLowerCase().includes(query)) ||
        (note.content && note.content.toLowerCase().includes(query))
    );
  }

  function updateNotesCount(filteredCount) {
    if (state.isLoading) {
      dom.notesCount.textContent = 'Loading…';
      return;
    }

    const total = state.notes.length;
    const query = state.searchQuery.trim();
    if (query) {
      dom.notesCount.textContent = `${filteredCount} of ${total} ${total === 1 ? 'Note' : 'Notes'}`;
    } else {
      dom.notesCount.textContent = `${total} ${total === 1 ? 'Note' : 'Notes'}`;
    }
  }

  function buildNoteCard(note, animateId) {
    const card = document.createElement('article');
    card.className = 'note-card';
    card.dataset.id = note.id;
    card.tabIndex = 0;
    card.setAttribute(
      'aria-label',
      `${note.title ? note.title : 'Untitled note'}. Press Enter to edit.`
    );

    if (note._pending) {
      card.classList.add('is-pending');
    }
    if (animateId && note.id === animateId) {
      card.classList.add('is-entering');
    }

    // Header row (dot + title + delete button)
    const header = document.createElement('div');
    header.className = 'note-card-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'note-title-row';

    const dot = document.createElement('span');
    dot.className = 'note-dot';
    dot.setAttribute('aria-hidden', 'true');

    const titleEl = document.createElement('h2');
    titleEl.className = 'note-title';
    if (note.title) {
      titleEl.textContent = note.title;
    } else {
      titleEl.classList.add('is-untitled');
      titleEl.textContent = 'Untitled Note';
    }

    titleRow.append(dot, titleEl);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'note-delete-btn';
    deleteBtn.setAttribute(
      'aria-label',
      `Delete ${note.title ? `"${note.title}"` : 'note'}`
    );
    deleteBtn.title = 'Delete note';
    deleteBtn.disabled = Boolean(note._pending);
    deleteBtn.appendChild(createTrashIconSvg());

    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      openDeleteSheet(note.id);
    });

    header.append(titleRow, deleteBtn);
    card.appendChild(header);

    // Content body
    if (note.content) {
      const contentEl = document.createElement('p');
      contentEl.className = 'note-content';
      contentEl.textContent = note.content;
      card.appendChild(contentEl);
    }

    // Footer (relative timestamp + edited indicator)
    const footer = document.createElement('div');
    footer.className = 'note-footer';

    const timeEl = document.createElement('time');
    timeEl.className = 'note-timestamp';
    timeEl.dateTime = note.createdAt;
    timeEl.dataset.iso = note.createdAt;
    timeEl.title = formatFullTimestamp(note.createdAt);
    timeEl.textContent = formatRelativeTime(note.createdAt);

    footer.appendChild(timeEl);

    if (note.updatedAt && note.updatedAt !== note.createdAt) {
      const editedEl = document.createElement('span');
      editedEl.className = 'note-edited-tag';
      editedEl.textContent = 'Edited';
      editedEl.title = `Edited ${formatFullTimestamp(note.updatedAt)}`;
      footer.appendChild(editedEl);
    }

    card.appendChild(footer);

    // Click or keyboard activate to edit
    if (!note._pending) {
      card.addEventListener('click', () => openEditModal(note.id));
      card.addEventListener('keydown', (event) => {
        if (event.target !== card) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openEditModal(note.id);
        }
      });
    }

    return card;
  }

  function render({ animateId = null, loadError = null } = {}) {
    const filtered = getFilteredNotes();
    updateNotesCount(filtered.length);

    dom.skeletonLoader.hidden = !state.isLoading;

    if (state.isLoading) {
      dom.emptyState.hidden = true;
      dom.searchEmptyState.hidden = true;
      dom.errorState.hidden = true;
      dom.notesContainer.hidden = true;
      return;
    }

    if (loadError) {
      dom.errorStateMessage.textContent = loadError;
      dom.errorState.hidden = false;
      dom.emptyState.hidden = true;
      dom.searchEmptyState.hidden = true;
      dom.notesContainer.hidden = true;
      return;
    }

    dom.errorState.hidden = true;

    if (state.notes.length === 0) {
      dom.emptyState.hidden = false;
      dom.searchEmptyState.hidden = true;
      dom.notesContainer.hidden = true;
      dom.notesContainer.textContent = '';
      return;
    }

    dom.emptyState.hidden = true;

    if (filtered.length === 0) {
      dom.searchEmptyState.hidden = false;
      dom.notesContainer.hidden = true;
      dom.notesContainer.textContent = '';
      return;
    }

    dom.searchEmptyState.hidden = true;
    dom.notesContainer.hidden = false;
    dom.notesContainer.textContent = '';

    const useMasonry = masonryMedia.matches && filtered.length > 1;
    dom.notesContainer.classList.toggle('is-masonry', useMasonry);

    if (useMasonry) {
      const colLeft = document.createElement('div');
      colLeft.className = 'masonry-column';
      const colRight = document.createElement('div');
      colRight.className = 'masonry-column';

      filtered.forEach((note, index) => {
        const card = buildNoteCard(note, animateId);
        if (index % 2 === 0) {
          colLeft.appendChild(card);
        } else {
          colRight.appendChild(card);
        }
      });

      dom.notesContainer.append(colLeft, colRight);
    } else {
      const fragment = document.createDocumentFragment();
      for (const note of filtered) {
        fragment.appendChild(buildNoteCard(note, animateId));
      }
      dom.notesContainer.appendChild(fragment);
    }
  }

  function refreshTimestamps() {
    const timeNodes = dom.notesContainer.querySelectorAll('time[data-iso]');
    timeNodes.forEach((el) => {
      el.textContent = formatRelativeTime(el.dataset.iso);
    });
  }

  /* ------------------------------------------------------------------------
     Delete Action Sheet + Optimistic Removal with Rollback
     ------------------------------------------------------------------------ */

  function openDeleteSheet(noteId) {
    const note = state.notes.find((n) => n.id === noteId);
    if (!note || note._pending) {
      return;
    }

    state.lastFocusedElement = document.activeElement;
    state.pendingDeleteId = noteId;

    dom.deleteSheetDesc.textContent = note.title
      ? `“${note.title}” will be permanently removed.`
      : 'This note will be permanently removed.';

    dom.deleteSheetBackdrop.hidden = false;
    dom.deleteSheetBackdrop.setAttribute('aria-hidden', 'false');
    void dom.deleteSheetBackdrop.offsetWidth;
    dom.deleteSheetBackdrop.classList.add('is-open');

    dom.cancelDeleteBtn.focus();
  }

  function closeDeleteSheet(restoreFocus = true) {
    if (dom.deleteSheetBackdrop.hidden) {
      return;
    }

    dom.deleteSheetBackdrop.classList.remove('is-open');
    dom.deleteSheetBackdrop.setAttribute('aria-hidden', 'true');
    state.pendingDeleteId = null;

    const finalize = () => {
      dom.deleteSheetBackdrop.hidden = true;
      if (restoreFocus && state.lastFocusedElement instanceof HTMLElement) {
        state.lastFocusedElement.focus();
      }
    };

    if (reducedMotionMedia.matches) {
      finalize();
    } else {
      setTimeout(finalize, 220);
    }
  }

  async function confirmDeleteNote() {
    const noteId = state.pendingDeleteId;
    if (!noteId) {
      return;
    }

    const noteIndex = state.notes.findIndex((n) => n.id === noteId);
    if (noteIndex === -1) {
      closeDeleteSheet(false);
      return;
    }

    const removedNote = state.notes[noteIndex];
    closeDeleteSheet(false);

    // Animate card shrink/fade/collapse before removing from state
    const cardEl = dom.notesContainer.querySelector(`.note-card[data-id="${CSS.escape(noteId)}"]`);
    if (cardEl && !reducedMotionMedia.matches) {
      cardEl.style.maxHeight = `${cardEl.offsetHeight}px`;
      void cardEl.offsetHeight;
      cardEl.classList.add('is-deleting');
      await new Promise((resolve) => setTimeout(resolve, DELETE_ANIMATION_MS));
    }

    // Optimistic removal
    state.notes = state.notes.filter((n) => n.id !== noteId);
    render();

    try {
      await apiRequest(`/notes/${encodeURIComponent(noteId)}`, {
        method: 'DELETE'
      });
      showToast('Note deleted');
    } catch (err) {
      // Rollback to original position
      const safeIndex = Math.min(noteIndex, state.notes.length);
      state.notes.splice(safeIndex, 0, removedNote);
      render({ animateId: removedNote.id });
      showToast(err.message || 'Could not delete note.', 'error');
    }
  }

  /* ------------------------------------------------------------------------
     Edit Modal Sheet (PUT /api/notes/:id)
     ------------------------------------------------------------------------ */

  function updateEditSaveState() {
    const note = state.notes.find((n) => n.id === state.editingNoteId);
    if (!note) {
      dom.editSaveBtn.disabled = true;
      return;
    }

    const nextTitle = dom.editTitleInput.value.trim();
    const nextContent = dom.editContentInput.value.trim();
    const hasContent = nextTitle.length > 0 || nextContent.length > 0;
    const isChanged = nextTitle !== (note.title || '') || nextContent !== (note.content || '');

    dom.editSaveBtn.disabled = !hasContent || !isChanged || state.isSavingEdit;
    dom.editSaveBtn.textContent = state.isSavingEdit ? 'Saving…' : 'Done';
  }

  function openEditModal(noteId) {
    const note = state.notes.find((n) => n.id === noteId);
    if (!note || note._pending) {
      return;
    }

    state.lastFocusedElement = document.activeElement;
    state.editingNoteId = noteId;

    dom.editTitleInput.value = note.title || '';
    dom.editContentInput.value = note.content || '';
    dom.editModalMeta.textContent = `Created ${formatFullTimestamp(note.createdAt)}`;

    dom.editModalBackdrop.hidden = false;
    dom.editModalBackdrop.setAttribute('aria-hidden', 'false');
    void dom.editModalBackdrop.offsetWidth;
    dom.editModalBackdrop.classList.add('is-open');

    autoGrowTextarea(dom.editContentInput);
    updateEditSaveState();
    dom.editContentInput.focus();
  }

  function closeEditModal(restoreFocus = true) {
    if (dom.editModalBackdrop.hidden) {
      return;
    }

    dom.editModalBackdrop.classList.remove('is-open');
    dom.editModalBackdrop.setAttribute('aria-hidden', 'true');
    state.editingNoteId = null;

    const finalize = () => {
      dom.editModalBackdrop.hidden = true;
      if (restoreFocus && state.lastFocusedElement instanceof HTMLElement) {
        state.lastFocusedElement.focus();
      }
    };

    if (reducedMotionMedia.matches) {
      finalize();
    } else {
      setTimeout(finalize, 220);
    }
  }

  async function handleEditSubmit(event) {
    event.preventDefault();
    if (state.isSavingEdit || !state.editingNoteId) {
      return;
    }

    const noteId = state.editingNoteId;
    const noteIndex = state.notes.findIndex((n) => n.id === noteId);
    if (noteIndex === -1) {
      closeEditModal();
      return;
    }

    const title = dom.editTitleInput.value.trim();
    const content = dom.editContentInput.value.trim();

    if (!title && !content) {
      showToast('Please enter a title or note content.', 'error');
      return;
    }

    if (title.length > MAX_TITLE_LENGTH) {
      showToast(`Title cannot exceed ${MAX_TITLE_LENGTH} characters.`, 'error');
      return;
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      showToast(`Content cannot exceed ${MAX_CONTENT_LENGTH} characters.`, 'error');
      return;
    }

    const previousNote = { ...state.notes[noteIndex] };
    state.isSavingEdit = true;
    updateEditSaveState();

    // Optimistic update
    state.notes[noteIndex] = {
      ...previousNote,
      title,
      content,
      updatedAt: new Date().toISOString()
    };
    closeEditModal(false);
    render();

    try {
      const updated = await apiRequest(`/notes/${encodeURIComponent(noteId)}`, {
        method: 'PUT',
        body: JSON.stringify({ title, content })
      });

      const currentIndex = state.notes.findIndex((n) => n.id === noteId);
      if (currentIndex !== -1) {
        state.notes[currentIndex] = updated;
      }
      render();
      showToast('Note updated');
    } catch (err) {
      // Rollback on failure
      const currentIndex = state.notes.findIndex((n) => n.id === noteId);
      if (currentIndex !== -1) {
        state.notes[currentIndex] = previousNote;
      }
      render();
      showToast(err.message || 'Could not update note.', 'error');
    } finally {
      state.isSavingEdit = false;
      updateEditSaveState();
    }
  }

  /* ------------------------------------------------------------------------
     Initial Data Load & Event Wiring
     ------------------------------------------------------------------------ */

  async function loadNotes() {
    state.isLoading = true;
    render();

    try {
      const notes = await apiRequest('/notes', { method: 'GET' });
      state.notes = Array.isArray(notes) ? notes : [];
      state.isLoading = false;
      render();
    } catch (err) {
      state.isLoading = false;
      render({ loadError: err.message || 'Unable to load notes.' });
      showToast(err.message || 'Unable to load notes.', 'error');
    }
  }

  function handleSearchChange() {
    state.searchQuery = dom.searchInput.value;
    dom.searchClearBtn.hidden = state.searchQuery.length === 0;
    render();
  }

  function clearSearch() {
    dom.searchInput.value = '';
    handleSearchChange();
    dom.searchInput.focus();
  }

  function bindEvents() {
    // Composer events
    dom.noteTitle.addEventListener('input', updateComposerState);
    dom.noteContent.addEventListener('input', () => {
      autoGrowTextarea(dom.noteContent);
      updateComposerState();
    });
    dom.composerForm.addEventListener('submit', handleComposerSubmit);

    // Cmd/Ctrl + Enter shortcut in composer
    dom.composerForm.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!dom.addNoteBtn.disabled) {
          handleComposerSubmit(event);
        }
      }
    });

    // Search events
    dom.searchInput.addEventListener('input', handleSearchChange);
    dom.searchClearBtn.addEventListener('click', clearSearch);
    dom.resetSearchBtn.addEventListener('click', clearSearch);
    dom.searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && dom.searchInput.value) {
        event.preventDefault();
        clearSearch();
      }
    });

    // Retry loading on error
    dom.retryLoadBtn.addEventListener('click', loadNotes);

    // Delete sheet events
    dom.confirmDeleteBtn.addEventListener('click', confirmDeleteNote);
    dom.cancelDeleteBtn.addEventListener('click', () => closeDeleteSheet(true));
    dom.deleteSheetBackdrop.addEventListener('click', (event) => {
      if (event.target === dom.deleteSheetBackdrop) {
        closeDeleteSheet(true);
      }
    });

    // Edit modal events
    dom.editTitleInput.addEventListener('input', updateEditSaveState);
    dom.editContentInput.addEventListener('input', () => {
      autoGrowTextarea(dom.editContentInput);
      updateEditSaveState();
    });
    dom.editForm.addEventListener('submit', handleEditSubmit);
    dom.editForm.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!dom.editSaveBtn.disabled) {
          handleEditSubmit(event);
        }
      }
    });
    dom.editCancelBtn.addEventListener('click', () => closeEditModal(true));
    dom.editModalBackdrop.addEventListener('click', (event) => {
      if (event.target === dom.editModalBackdrop) {
        closeEditModal(true);
      }
    });

    // Global Escape key to dismiss active overlays
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!dom.deleteSheetBackdrop.hidden) {
        event.preventDefault();
        closeDeleteSheet(true);
      } else if (!dom.editModalBackdrop.hidden) {
        event.preventDefault();
        closeEditModal(true);
      }
    });

    // Re-layout masonry when crossing 900px breakpoint
    if (typeof masonryMedia.addEventListener === 'function') {
      masonryMedia.addEventListener('change', () => render());
    } else if (typeof masonryMedia.addListener === 'function') {
      masonryMedia.addListener(() => render());
    }

    // Periodically refresh relative timestamps ("Just now" -> "1 min ago", etc.)
    setInterval(refreshTimestamps, 30000);
  }

  // Bootstrap application
  bindEvents();
  updateComposerState();
  loadNotes();
})();

