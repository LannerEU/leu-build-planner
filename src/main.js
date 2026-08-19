import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const STATUSES = ['Request', 'Planned', 'Ongoing', 'Completed', 'Delayed', 'On Leave'];
const WEEKS_PER_PAGE = 5;
const PLANNER_YEAR = 2026;

const supabaseUrl = window.LEU_PLANNER_CONFIG?.supabaseUrl;
const supabaseKey = window.LEU_PLANNER_CONFIG?.supabaseAnonKey;
const hasSupabase = Boolean(supabaseUrl && supabaseKey);
const supabase = hasSupabase ? createClient(supabaseUrl, supabaseKey) : null;

const sampleItems = [
  ['Navugo-1515F-1x', 32, 'Monday', 'Completed'],
  ['Re-label-2137C', 32, 'Monday', 'Completed'],
  ['Cobbler-1040-10x', 32, 'Tuesday', 'Planned'],
  ['RMA-5520C-1x', 32, 'Wednesday', 'Planned'],
  ['E-Cubed-4240B-1x', 32, 'Wednesday', 'Planned'],
  ['Neeco-1515A-4x', 32, 'Thursday', 'Planned'],
  ['Dynacon-6041B-3x', 32, 'Thursday', 'Planned'],
  ['Dynacon-6041B-7x', 32, 'Friday', 'Planned']
].map(([title, week, day, status], i) => ({
  id: `sample-${i}`,
  title,
  week,
  day,
  status,
  notes: '',
  sort_order: (i + 1) * 1000,
  shipping_required: false,
  shipped: false,
  for_billing: false,
  billed: false
}));

const state = {
  items: [],
  startWeek: 32,
  user: null,
  modal: null,
  busy: false,
  message: '',
  draggedId: null,
  plannerNotes: []
};

const localKey = 'leu-build-planner-items-v1';
const app = document.querySelector('#app');

function localLoad() {
  const raw = localStorage.getItem(localKey);
  if (!raw) return sampleItems;

  try {
    return JSON.parse(raw);
  } catch {
    return sampleItems;
  }
}

function localSave() {
  localStorage.setItem(localKey, JSON.stringify(state.items));
}

function setMessage(message) {
  state.message = message;
  render();

  setTimeout(() => {
    if (state.message === message) {
      state.message = '';
      render();
    }
  }, 2800);
}

function isAdmin() {
  return Boolean(state.user);
}

function escapeHtml(value = '') {
  return String(value).replace(
    /[&<>'"]/g,
    char =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      })[char]
  );
}

function getStatusClass(status = 'Planned') {
  return `status-${String(status).toLowerCase().replace(/\s+/g, '-')}`;
}

function normalizeLegacyStatus(status) {
  if (status === 'Complete') return 'Completed';
  if (status === 'Blocked') return 'Delayed';
  return status || 'Planned';
}

function normalizeTracking(item) {
  return {
    shipping_required: Boolean(item.shipping_required),
    shipped: Boolean(item.shipped),
    for_billing: Boolean(item.for_billing),
    billed: Boolean(item.billed)
  };
}

function getIsoWeekDate(year, week, dayIndex) {
  const january4 = new Date(Date.UTC(year, 0, 4));
  const january4Day = january4.getUTCDay() || 7;

  const firstMonday = new Date(january4);
  firstMonday.setUTCDate(january4.getUTCDate() - january4Day + 1);

  const result = new Date(firstMonday);
  result.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7 + dayIndex);

  return result;
}

function formatPlannerDate(week, day) {
  const dayIndex = DAYS.indexOf(day);
  if (dayIndex < 0) return '';

  const date = getIsoWeekDate(PLANNER_YEAR, week, dayIndex);

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit'
  }).format(date);
}

function getVisibleWeeks() {
  return Array.from(
    { length: WEEKS_PER_PAGE },
    (_, index) => state.startWeek + index
  );
}

function getVisibleItems() {
  const visibleWeeks = new Set(getVisibleWeeks().map(Number));
  return state.items.filter(item => visibleWeeks.has(Number(item.week)));
}

function getVisibleSummary() {
  const items = getVisibleItems();

  const statusCounts = Object.fromEntries(
    STATUSES.map(status => [
      status,
      items.filter(item => normalizeLegacyStatus(item.status) === status).length
    ])
  );

  return {
    statusCounts,
    shippingBox: items.filter(item => item.shipping_required && !item.shipped).length,
    shipped: items.filter(item => item.shipped).length,
    forBilling: items.filter(item => item.for_billing && !item.billed).length,
    billed: items.filter(item => item.billed).length
  };
}


async function loadPlannerNotes() {
  if (!hasSupabase) {
    state.plannerNotes = JSON.parse(
      localStorage.getItem('leu-build-planner-quick-notes-v1') || '[]'
    );
    return;
  }

  const { data, error } = await supabase
    .from('planner_notes')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    state.message = `Could not load quick notes: ${error.message}`;
    return;
  }

  state.plannerNotes = data || [];
}

function saveLocalPlannerNotes() {
  localStorage.setItem(
    'leu-build-planner-quick-notes-v1',
    JSON.stringify(state.plannerNotes)
  );
}

async function savePlannerNote(note) {
  if (!isAdmin()) return;

  const text = String(note.note || '').trim();
  if (!text) throw new Error('Note cannot be empty.');

  if (!hasSupabase) {
    if (note.id) {
      const index = state.plannerNotes.findIndex(
        item => String(item.id) === String(note.id)
      );

      if (index >= 0) {
        state.plannerNotes[index] = {
          ...state.plannerNotes[index],
          note: text,
          updated_at: new Date().toISOString()
        };
      }
    } else {
      state.plannerNotes.unshift({
        id: crypto.randomUUID(),
        note: text,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    saveLocalPlannerNotes();
    return;
  }

  if (note.id) {
    const { error } = await supabase
      .from('planner_notes')
      .update({
        note: text,
        updated_at: new Date().toISOString()
      })
      .eq('id', note.id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('planner_notes')
      .insert({ note: text });

    if (error) throw error;
  }

  await loadPlannerNotes();
}

async function deletePlannerNote(id) {
  if (!isAdmin()) return;

  if (!confirm('Delete this quick note?')) return;

  if (!hasSupabase) {
    state.plannerNotes = state.plannerNotes.filter(
      note => String(note.id) !== String(id)
    );
    saveLocalPlannerNotes();
    render();
    return;
  }

  const { error } = await supabase
    .from('planner_notes')
    .delete()
    .eq('id', id);

  if (error) {
    setMessage(error.message);
    return;
  }

  await loadPlannerNotes();
  render();
}

async function loadItems() {
  state.busy = true;
  render();

  if (!hasSupabase) {
    state.items = localLoad().map(item => ({
      ...item,
      status: normalizeLegacyStatus(item.status),
      ...normalizeTracking(item)
    }));
  } else {
    const { data, error } = await supabase
      .from('build_items')
      .select('*')
      .order('week')
      .order('day')
      .order('sort_order');

    if (error) {
      state.message = `Could not load shared schedule: ${error.message}`;
    } else {
      state.items = (data || []).map(item => ({
        ...item,
        status: normalizeLegacyStatus(item.status),
        ...normalizeTracking(item)
      }));
    }
  }

  state.busy = false;
  render();
}

async function saveItem(item) {
  if (!isAdmin()) return;

  if (!hasSupabase) {
    const index = state.items.findIndex(existing => existing.id === item.id);

    if (index >= 0) {
      state.items[index] = item;
    } else {
      state.items.push(item);
    }

    localSave();
    render();
    return;
  }

  const payload = {
    title: item.title,
    week: Number(item.week),
    day: item.day,
    status: item.status,
    notes: item.notes || '',
    sort_order: Number(item.sort_order || 0),
    shipping_required: Boolean(item.shipping_required),
    shipped: Boolean(item.shipped),
    for_billing: Boolean(item.for_billing),
    billed: Boolean(item.billed)
  };

  if (item.id) {
    const { error } = await supabase
      .from('build_items')
      .update(payload)
      .eq('id', item.id);

    if (error) throw error;
  } else {
    const { error } = await supabase.from('build_items').insert(payload);
    if (error) throw error;
  }

  await loadItems();
}

async function removeItem(id) {
  if (!isAdmin() || !confirm('Remove this schedule item?')) return;

  if (!hasSupabase) {
    state.items = state.items.filter(item => item.id !== id);
    localSave();
    render();
    return;
  }

  const { error } = await supabase.from('build_items').delete().eq('id', id);

  if (error) {
    setMessage(error.message);
  } else {
    await loadItems();
  }
}

function clearDropIndicators() {
  document
    .querySelectorAll('.card.drop-before, .card.drop-after')
    .forEach(card => card.classList.remove('drop-before', 'drop-after'));

  document
    .querySelectorAll('.day-cell.drag-over')
    .forEach(cell => cell.classList.remove('drag-over'));
}

async function reorderItem(id, targetWeek, targetDay, targetId = null, placeAfter = false) {
  if (!isAdmin()) return;

  const dragged = state.items.find(item => String(item.id) === String(id));
  if (!dragged) return;

  const destinationItems = state.items
    .filter(
      item =>
        Number(item.week) === Number(targetWeek) &&
        item.day === targetDay &&
        String(item.id) !== String(id)
    )
    .sort(
      (first, second) =>
        (first.sort_order || 0) - (second.sort_order || 0)
    );

  let insertIndex = destinationItems.length;

  if (targetId) {
    const targetIndex = destinationItems.findIndex(
      item => String(item.id) === String(targetId)
    );

    if (targetIndex >= 0) {
      insertIndex = targetIndex + (placeAfter ? 1 : 0);
    }
  }

  const reordered = [...destinationItems];
  reordered.splice(insertIndex, 0, {
    ...dragged,
    week: Number(targetWeek),
    day: targetDay
  });

  const normalizedDestination = reordered.map((item, index) => ({
    ...item,
    week: Number(targetWeek),
    day: targetDay,
    sort_order: (index + 1) * 1000
  }));

  if (!hasSupabase) {
    const changedById = new Map(
      normalizedDestination.map(item => [String(item.id), item])
    );

    state.items = state.items.map(item =>
      changedById.get(String(item.id)) || item
    );

    localSave();
    render();
  } else {
    const updates = await Promise.all(
      normalizedDestination.map(item =>
        supabase
          .from('build_items')
          .update({
            week: Number(item.week),
            day: item.day,
            sort_order: Number(item.sort_order)
          })
          .eq('id', item.id)
      )
    );

    const failed = updates.find(result => result.error);
    if (failed?.error) throw failed.error;

    await loadItems();
  }

  setMessage('Schedule order updated.');
}

function renderSummarySidebar() {
  const weeks = getVisibleWeeks();
  const summary = getVisibleSummary();

  const statusRows = STATUSES.map(status => `
    <div class="summary-row">
      <span class="summary-label">
        <span class="summary-dot ${getStatusClass(status)}"></span>
        ${status}
      </span>
      <strong>${summary.statusCounts[status]}</strong>
    </div>
  `).join('');

  const quickNotes = state.plannerNotes.length
    ? state.plannerNotes.map(note => `
        <div class="quick-note-item">
          <div class="quick-note-text">${escapeHtml(note.note)}</div>

          ${
            isAdmin()
              ? `
                <div class="quick-note-actions">
                  <button
                    class="quick-note-link"
                    data-action="edit-quick-note"
                    data-id="${note.id}"
                  >Edit</button>

                  <button
                    class="quick-note-link delete"
                    data-action="delete-quick-note"
                    data-id="${note.id}"
                  >Delete</button>
                </div>
              `
              : ''
          }
        </div>
      `).join('')
    : `<div class="quick-note-empty">No quick notes yet.</div>`;

  return `
    <aside class="summary-sidebar">
      <section class="summary-card">
        <h3>Summary <span>(Weeks ${weeks[0]}–${weeks.at(-1)})</span></h3>
        <div class="summary-list">
          ${statusRows}
        </div>
      </section>

      <section class="summary-card">
        <h3>Shipping & Billing</h3>
        <div class="summary-list">
          <div class="summary-row">
            <span class="summary-label">📦 Shipping Box</span>
            <strong>${summary.shippingBox}</strong>
          </div>
          <div class="summary-row">
            <span class="summary-label">✓ Shipped</span>
            <strong>${summary.shipped}</strong>
          </div>
          <div class="summary-row">
            <span class="summary-label">🧾 For Billing</span>
            <strong>${summary.forBilling}</strong>
          </div>
          <div class="summary-row">
            <span class="summary-label">✓ Billed</span>
            <strong>${summary.billed}</strong>
          </div>
        </div>
      </section>

      <section class="summary-card quick-notes-card">
        <div class="quick-notes-heading">
          <h3>Quick Notes</h3>

          ${
            isAdmin()
              ? `<button class="btn quick-note-add" data-action="add-quick-note">+ Add</button>`
              : ''
          }
        </div>

        <div class="quick-notes-list">
          ${quickNotes}
        </div>
      </section>
    </aside>
  `;
}

function render() {
  const weeks = getVisibleWeeks();

  app.innerHTML = `
    <main class="shell">
      <header class="header">
        <div>
          <h1>LEU Build Planner</h1>
          <p>Shared-format weekly build schedule</p>
        </div>
        <span class="mode-badge ${isAdmin() ? 'admin' : ''}">
          ${isAdmin() ? 'Admin mode' : 'Viewer mode'}
        </span>
      </header>

      <div class="notice">
        Viewer mode is read-only. Admin users can add, edit, remove, drag schedule cards, and reorder builds within the same day.
        ${hasSupabase ? 'Changes are shared with the team after refresh.' : 'This demo is using browser storage.'}
      </div>

      <section class="toolbar">
        ${
          isAdmin()
            ? `
              <button class="btn primary" data-action="add">+ Add build</button>
              <button class="btn" data-action="export">Export JSON</button>
              <button class="btn" data-action="import">Import JSON</button>
              <input hidden type="file" id="json-file" accept="application/json">
              <button class="btn danger" data-action="reset">Reset sample</button>
              <button class="btn" data-action="logout">Exit admin mode</button>
            `
            : `<button class="btn primary" data-action="login">Admin sign in</button>`
        }

        <span class="spacer"></span>

        <button class="btn" data-action="previous">← Previous</button>
        <span class="week-label">Weeks ${weeks[0]} - ${weeks.at(-1)} · ${PLANNER_YEAR}</span>
        <button class="btn" data-action="next">Next →</button>
      </section>

      <div class="status-line">
        ${state.busy ? 'Loading…' : escapeHtml(state.message)}
      </div>

      <div class="content-layout">
        <section class="planner-wrap">
          <div class="planner">
            <div class="cell header-cell">Week</div>
            ${DAYS.map(day => `<div class="cell header-cell">${day}</div>`).join('')}
            ${weeks
              .map(
                week => `
                  <div class="cell week-number">${week}</div>
                  ${DAYS.map(day => renderDay(week, day)).join('')}
                `
              )
              .join('')}
          </div>
        </section>

        ${renderSummarySidebar()}
      </div>
    </main>

    ${renderModal()}
  `;

  bindEvents();
}

function renderDay(week, day) {
  const items = state.items
    .filter(item => Number(item.week) === week && item.day === day)
    .sort(
      (first, second) =>
        (first.sort_order || 0) - (second.sort_order || 0)
    );

  return `
    <div class="cell day-cell" data-week="${week}" data-day="${day}">
      <div class="cell-date">${formatPlannerDate(week, day)}</div>

      ${
        items.length
          ? items.map(renderCard).join('')
          : `<div class="empty-hint">${isAdmin() ? 'Drop a build here' : ''}</div>`
      }
    </div>
  `;
}

function renderTracking(item) {
  const chips = [];

  if (item.shipping_required && !item.shipped) {
    chips.push(`<span class="tracking-chip shipping">📦 Shipping</span>`);
  }

  if (item.shipped) {
    chips.push(`<span class="tracking-chip shipped">✓ Shipped</span>`);
  }

  if (item.for_billing && !item.billed) {
    chips.push(`<span class="tracking-chip billing">🧾 For Billing</span>`);
  }

  if (item.billed) {
    chips.push(`<span class="tracking-chip billed">✓ Billed</span>`);
  }

  return chips.length
    ? `<div class="tracking-row">${chips.join('')}</div>`
    : '';
}

function renderCard(item) {
  const status = normalizeLegacyStatus(item.status);
  const statusClass = getStatusClass(status);

  return `
    <article
      class="card ${statusClass}"
      draggable="${isAdmin()}"
      data-id="${item.id}"
    >
      <div class="card-title">${escapeHtml(item.title)}</div>

      <div class="card-meta">
        <span class="status-pill ${statusClass}">
          ${escapeHtml(status)}
        </span>
      </div>

      ${renderTracking(item)}

      ${
        item.notes
          ? `<div class="card-notes"><div class="note-label">💬 Note</div><div>${escapeHtml(item.notes)}</div></div>`
          : ''
      }

      ${
        isAdmin()
          ? `
            <div class="card-actions">
              <button class="link-btn" data-action="edit" data-id="${item.id}">Edit</button>
              <button class="link-btn" data-action="remove" data-id="${item.id}">Remove</button>
            </div>
          `
          : ''
      }
    </article>
  `;
}

function renderModal() {
  if (!state.modal) return '';

  if (state.modal.type === 'login') {
    return `
      <div class="modal-backdrop">
        <form class="modal" id="login-form">
          <h2>Admin sign in</h2>

          <div class="field">
            <label>Email</label>
            <input name="email" type="email" required autocomplete="username">
          </div>

          <div class="field" style="margin-top:12px">
            <label>Password</label>
            <input name="password" type="password" required autocomplete="current-password">
          </div>

          <div class="login-note">
            ${hasSupabase ? 'Use an admin account created in Supabase Authentication.' : 'Demo mode.'}
          </div>

          <div class="modal-actions">
            <button type="button" class="btn" data-action="close-modal">Cancel</button>
            <button class="btn primary">Sign in</button>
          </div>
        </form>
      </div>
    `;
  }


  if (state.modal.type === 'quick-note') {
    const note = state.modal.note || { id: '', note: '' };

    return `
      <div class="modal-backdrop">
        <form class="modal quick-note-modal" id="quick-note-form">
          <h2>${note.id ? 'Edit quick note' : 'Add quick note'}</h2>

          <input type="hidden" name="id" value="${note.id || ''}">

          <div class="field">
            <label>Note</label>
            <textarea
              name="note"
              required
              placeholder="Type anything you want the team to see..."
            >${escapeHtml(note.note || '')}</textarea>
          </div>

          <div class="modal-actions">
            <button
              type="button"
              class="btn"
              data-action="close-modal"
            >Cancel</button>

            <button class="btn primary">Save note</button>
          </div>
        </form>
      </div>
    `;
  }

  const item = state.modal.item || {
    title: '',
    week: state.startWeek,
    day: 'Monday',
    status: 'Planned',
    notes: '',
    sort_order: Date.now(),
    shipping_required: false,
    shipped: false,
    for_billing: false,
    billed: false
  };

  const selectedStatus = normalizeLegacyStatus(item.status);

  return `
    <div class="modal-backdrop">
      <form class="modal" id="item-form">
        <h2>${item.id ? 'Edit build' : 'Add build'}</h2>

        <input type="hidden" name="id" value="${item.id || ''}">

        <div class="form-grid">
          <div class="field full">
            <label>Build / activity</label>
            <input name="title" required value="${escapeHtml(item.title)}">
          </div>

          <div class="field">
            <label>Week</label>
            <input name="week" required type="number" min="1" max="53" value="${item.week}">
          </div>

          <div class="field">
            <label>Day</label>
            <select name="day">
              ${DAYS.map(
                day =>
                  `<option ${day === item.day ? 'selected' : ''}>${day}</option>`
              ).join('')}
            </select>
          </div>

          <div class="field">
            <label>Status</label>
            <select name="status">
              ${STATUSES.map(
                status =>
                  `<option ${status === selectedStatus ? 'selected' : ''}>${status}</option>`
              ).join('')}
            </select>
          </div>

          <div class="field full">
            <label>Notes</label>
            <textarea name="notes">${escapeHtml(item.notes || '')}</textarea>
          </div>

          <div class="field full">
            <label>Shipping & Billing</label>

            <div class="check-grid">
              <label class="check-card">
                <input type="checkbox" name="shipping_required" ${item.shipping_required ? 'checked' : ''}>
                <span>
                  <strong>📦 Shipping required</strong>
                  <small>Build needs to be packed or shipped.</small>
                </span>
              </label>

              <label class="check-card">
                <input type="checkbox" name="shipped" ${item.shipped ? 'checked' : ''}>
                <span>
                  <strong>✓ Shipped</strong>
                  <small>Shipment has been completed.</small>
                </span>
              </label>

              <label class="check-card">
                <input type="checkbox" name="for_billing" ${item.for_billing ? 'checked' : ''}>
                <span>
                  <strong>🧾 For billing</strong>
                  <small>Ready for the billing process.</small>
                </span>
              </label>

              <label class="check-card">
                <input type="checkbox" name="billed" ${item.billed ? 'checked' : ''}>
                <span>
                  <strong>✓ Billed</strong>
                  <small>Billing has been completed.</small>
                </span>
              </label>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn" data-action="close-modal">Cancel</button>
          <button class="btn primary">Save</button>
        </div>
      </form>
    </div>
  `;
}

function bindEvents() {
  document
    .querySelectorAll('[data-action]')
    .forEach(element =>
      element.addEventListener('click', handleAction)
    );

  document
    .querySelector('#login-form')
    ?.addEventListener('submit', login);

  document
    .querySelector('#item-form')
    ?.addEventListener('submit', submitItem);

  document
    .querySelector('#quick-note-form')
    ?.addEventListener('submit', submitQuickNote);

  document
    .querySelector('#json-file')
    ?.addEventListener('change', importJson);

  document
    .querySelectorAll('.card[draggable="true"]')
    .forEach(card => {
      card.addEventListener('dragstart', event => {
        state.draggedId = card.dataset.id;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', card.dataset.id);
        card.classList.add('dragging');
      });

      card.addEventListener('dragend', () => {
        state.draggedId = null;
        card.classList.remove('dragging');
        clearDropIndicators();
      });

      card.addEventListener('dragover', event => {
        if (!isAdmin()) return;
        if (String(card.dataset.id) === String(state.draggedId)) return;

        event.preventDefault();
        event.stopPropagation();

        clearDropIndicators();

        const rect = card.getBoundingClientRect();
        const placeAfter = event.clientY > rect.top + rect.height / 2;

        card.classList.add(placeAfter ? 'drop-after' : 'drop-before');
      });

      card.addEventListener('drop', async event => {
        if (!isAdmin()) return;

        event.preventDefault();
        event.stopPropagation();

        const draggedId =
          event.dataTransfer.getData('text/plain') || state.draggedId;

        if (!draggedId || String(draggedId) === String(card.dataset.id)) {
          clearDropIndicators();
          return;
        }

        const cell = card.closest('.day-cell');
        const placeAfter = card.classList.contains('drop-after');

        clearDropIndicators();

        try {
          await reorderItem(
            draggedId,
            Number(cell.dataset.week),
            cell.dataset.day,
            card.dataset.id,
            placeAfter
          );
        } catch (error) {
          setMessage(error.message);
        }
      });
    });

  document.querySelectorAll('.day-cell').forEach(cell => {
    cell.addEventListener('dragover', event => {
      if (!isAdmin()) return;

      event.preventDefault();

      if (!event.target.closest('.card')) {
        clearDropIndicators();
        cell.classList.add('drag-over');
      }
    });

    cell.addEventListener('dragleave', event => {
      if (!cell.contains(event.relatedTarget)) {
        cell.classList.remove('drag-over');
      }
    });

    cell.addEventListener('drop', async event => {
      if (!isAdmin()) return;
      if (event.target.closest('.card')) return;

      event.preventDefault();

      const draggedId =
        event.dataTransfer.getData('text/plain') || state.draggedId;

      clearDropIndicators();

      if (!draggedId) return;

      try {
        await reorderItem(
          draggedId,
          Number(cell.dataset.week),
          cell.dataset.day
        );
      } catch (error) {
        setMessage(error.message);
      }
    });
  });
}

async function handleAction(event) {
  const action = event.currentTarget.dataset.action;

  if (action === 'add') {
    state.modal = { type: 'item' };
    render();
  }

  if (action === 'edit') {
    state.modal = {
      type: 'item',
      item: state.items.find(
        item => String(item.id) === event.currentTarget.dataset.id
      )
    };
    render();
  }

  if (action === 'remove') {
    removeItem(event.currentTarget.dataset.id);
  }

  if (action === 'add-quick-note') {
    state.modal = { type: 'quick-note' };
    render();
  }

  if (action === 'edit-quick-note') {
    state.modal = {
      type: 'quick-note',
      note: state.plannerNotes.find(
        note => String(note.id) === String(event.currentTarget.dataset.id)
      )
    };
    render();
  }

  if (action === 'delete-quick-note') {
    await deletePlannerNote(event.currentTarget.dataset.id);
  }


  if (action === 'close-modal') {
    state.modal = null;
    render();
  }

  if (action === 'login') {
    state.modal = { type: 'login' };
    render();
  }

  if (action === 'logout') {
    if (hasSupabase) await supabase.auth.signOut();
    state.user = null;
    render();
  }

  if (action === 'previous') {
    state.startWeek = Math.max(1, state.startWeek - WEEKS_PER_PAGE);
    render();
  }

  if (action === 'next') {
    state.startWeek = Math.min(49, state.startWeek + WEEKS_PER_PAGE);
    render();
  }

  if (action === 'export') {
    exportJson();
  }

  if (action === 'import') {
    document.querySelector('#json-file').click();
  }

  if (
    action === 'reset' &&
    confirm('Replace the current schedule with sample data?')
  ) {
    await resetSample();
  }
}

async function login(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);

  if (!hasSupabase) {
    state.user = { email: form.get('email') };
    state.modal = null;
    render();
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: form.get('email'),
    password: form.get('password')
  });

  if (error) {
    setMessage(error.message);
  } else {
    state.user = data.user;
    state.modal = null;
    render();
  }
}


async function submitQuickNote(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);

  try {
    await savePlannerNote({
      id: form.get('id') || undefined,
      note: form.get('note')
    });

    state.modal = null;
    render();
    setMessage('Quick note saved.');
  } catch (error) {
    setMessage(error.message);
  }
}

async function submitItem(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const existing = state.items.find(
    item => String(item.id) === String(form.get('id'))
  );

  const shipped = form.get('shipped') === 'on';
  const billed = form.get('billed') === 'on';

  const item = {
    ...(existing || {}),
    id: form.get('id') || undefined,
    title: form.get('title').trim(),
    week: Number(form.get('week')),
    day: form.get('day'),
    status: form.get('status'),
    notes: form.get('notes').trim(),
    sort_order: existing?.sort_order || Date.now(),
    shipping_required:
      form.get('shipping_required') === 'on' || shipped,
    shipped,
    for_billing:
      form.get('for_billing') === 'on' || billed,
    billed
  };

  try {
    await saveItem(item);
    state.modal = null;
    render();
    setMessage('Schedule saved.');
  } catch (error) {
    setMessage(error.message);
  }
}

function exportJson() {
  const blob = new Blob(
    [JSON.stringify(state.items, null, 2)],
    { type: 'application/json' }
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = 'leu-build-planner.json';
  anchor.click();

  URL.revokeObjectURL(url);
}

async function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());

    if (!Array.isArray(parsed)) {
      throw new Error('JSON must contain an array of schedule items.');
    }

    if (hasSupabase) {
      const rows = parsed.map(
        ({
          title,
          week,
          day,
          status,
          notes,
          sort_order,
          shipping_required,
          shipped,
          for_billing,
          billed
        }) => ({
          title,
          week: Number(week),
          day,
          status: normalizeLegacyStatus(status),
          notes: notes || '',
          sort_order: Number(sort_order || Date.now()),
          shipping_required: Boolean(shipping_required),
          shipped: Boolean(shipped),
          for_billing: Boolean(for_billing),
          billed: Boolean(billed)
        })
      );

      const { error } = await supabase.from('build_items').insert(rows);
      if (error) throw error;

      await loadItems();
    } else {
      state.items = parsed.map(item => ({
        ...item,
        status: normalizeLegacyStatus(item.status),
        ...normalizeTracking(item)
      }));

      localSave();
      render();
    }

    setMessage('JSON imported.');
  } catch (error) {
    setMessage(error.message);
  }

  event.target.value = '';
}

async function resetSample() {
  if (hasSupabase) {
    const { error: deleteError } = await supabase
      .from('build_items')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) {
      setMessage(deleteError.message);
      return;
    }

    const rows = sampleItems.map(({ id, ...item }) => item);
    const { error } = await supabase.from('build_items').insert(rows);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadItems();
  } else {
    state.items = structuredClone(sampleItems);
    localSave();
    render();
  }

  setMessage('Sample schedule restored.');
}

async function init() {
  if (hasSupabase) {
    const { data } = await supabase.auth.getSession();
    state.user = data.session?.user || null;

    supabase.auth.onAuthStateChange((_event, session) => {
      state.user = session?.user || null;
      render();
    });
  }

  await Promise.all([
    loadItems(),
    loadPlannerNotes()
  ]);

  render();
}

init();
