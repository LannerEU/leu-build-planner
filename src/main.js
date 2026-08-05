import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const WEEKS_PER_PAGE = 5;
const supabaseUrl = window.LEU_PLANNER_CONFIG?.supabaseUrl;
const supabaseKey = window.LEU_PLANNER_CONFIG?.supabaseAnonKey;
const hasSupabase = Boolean(supabaseUrl && supabaseKey);
const supabase = hasSupabase ? createClient(supabaseUrl, supabaseKey) : null;

const sampleItems = [
  ['Navugo-1515F-1x', 32, 'Monday', 'Complete'],
  ['Re-label-2137C', 32, 'Monday', 'Complete'],
  ['Cobbler-1040-10x', 32, 'Tuesday', 'Planned'],
  ['RMA-5520C-1x', 32, 'Wednesday', 'Planned'],
  ['E-Cubed-4240B-1x', 32, 'Wednesday', 'Planned'],
  ['Neeco-1515A-4x', 32, 'Thursday', 'Planned'],
  ['Dynacon-6041B-3x', 32, 'Thursday', 'Planned'],
  ['Dynacon-6041B-7x', 32, 'Friday', 'Planned'],
  ['Tentative Off - 11-14', 33, 'Tuesday', 'On Leave'],
  ['Tentative Off - 11-14', 33, 'Wednesday', 'On Leave'],
  ['Tentative Off - 11-14', 33, 'Thursday', 'On Leave'],
  ['Tentative Off - 11-14', 33, 'Friday', 'On Leave'],
  ['Neox-6530A-1x', 34, 'Monday', 'Planned'],
  ['RazorSecure-P375-2x', 34, 'Monday', 'Planned'],
  ['RazorSecure-P375-3x', 34, 'Tuesday', 'Planned'],
  ['DFS-EAI-I132B-1x', 34, 'Tuesday', 'Planned'],
  ['RMA-4POS-I732B-1x', 34, 'Wednesday', 'Planned'],
  ['Dynacon-4012A-4x', 34, 'Wednesday', 'Planned'],
  ['Dynacon-5520-7x', 34, 'Thursday', 'Planned'],
  ['Dynacon-5520-3x', 34, 'Friday', 'Planned']
].map(([title, week, day, status], i) => ({
  id: `sample-${i}`,
  title,
  week,
  day,
  status,
  notes: '',
  sort_order: i
}));

const state = {
  items: [],
  startWeek: 32,
  user: null,
  modal: null,
  busy: false,
  message: ''
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

async function loadItems() {
  state.busy = true;
  render();

  if (!hasSupabase) {
    state.items = localLoad();
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
      state.items = data || [];
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
    sort_order: Number(item.sort_order || 0)
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

async function moveItem(id, week, day) {
  if (!isAdmin()) return;

  const item = state.items.find(existing => String(existing.id) === String(id));
  if (!item) return;

  try {
    await saveItem({ ...item, week, day });
    setMessage(`Moved to ${day}, week ${week}.`);
  } catch (error) {
    setMessage(error.message);
  }
}

function render() {
  const weeks = Array.from(
    { length: WEEKS_PER_PAGE },
    (_, index) => state.startWeek + index
  );

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
        Viewer mode is read-only. Admin users can add, edit, remove, and drag schedule cards.
        ${
          hasSupabase
            ? 'Changes are shared with the team after refresh.'
            : 'This demo is using browser storage; connect Supabase for team-wide shared data.'
        }
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
        <span class="week-label">Weeks ${weeks[0]} - ${weeks.at(-1)}</span>
        <button class="btn" data-action="next">Next →</button>
      </section>

      <div class="status-line">
        ${state.busy ? 'Loading…' : escapeHtml(state.message)}
      </div>

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
      ${
        items.length
          ? items.map(renderCard).join('')
          : `<div class="empty-hint">${isAdmin() ? 'Drop a build here' : ''}</div>`
      }
    </div>
  `;
}

function renderCard(item) {
  const statusClass = getStatusClass(item.status);

  return `
    <article
      class="card ${statusClass}"
      draggable="${isAdmin()}"
      data-id="${item.id}"
    >
      <div class="card-title">${escapeHtml(item.title)}</div>

      <div class="card-meta">
        <span class="status-pill ${statusClass}">
          ${escapeHtml(item.status)}
        </span>
      </div>

      ${
        item.notes
          ? `<div class="card-notes">${escapeHtml(item.notes)}</div>`
          : ''
      }

      ${
        isAdmin()
          ? `
            <div class="card-actions">
              <button class="link-btn" data-action="edit" data-id="${item.id}">
                Edit
              </button>
              <button class="link-btn" data-action="remove" data-id="${item.id}">
                Remove
              </button>
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
            <input
              name="email"
              type="email"
              required
              autocomplete="username"
            >
          </div>

          <div class="field" style="margin-top:12px">
            <label>Password</label>
            <input
              name="password"
              type="password"
              required
              autocomplete="current-password"
            >
          </div>

          <div class="login-note">
            ${
              hasSupabase
                ? 'Use an admin account created in Supabase Authentication.'
                : 'Demo mode: enter any email and password to enable local admin mode.'
            }
          </div>

          <div class="modal-actions">
            <button type="button" class="btn" data-action="close-modal">
              Cancel
            </button>
            <button class="btn primary">Sign in</button>
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
    sort_order: Date.now()
  };

  return `
    <div class="modal-backdrop">
      <form class="modal" id="item-form">
        <h2>${item.id ? 'Edit build' : 'Add build'}</h2>

        <input type="hidden" name="id" value="${item.id || ''}">

        <div class="form-grid">
          <div class="field full">
            <label>Build / activity</label>
            <input
              name="title"
              required
              value="${escapeHtml(item.title)}"
            >
          </div>

          <div class="field">
            <label>Week</label>
            <input
              name="week"
              required
              type="number"
              min="1"
              max="53"
              value="${item.week}"
            >
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
              <option ${item.status === 'Planned' ? 'selected' : ''}>
                Planned
              </option>
              <option ${item.status === 'Ongoing' ? 'selected' : ''}>
                Ongoing
              </option>
              <option ${item.status === 'Completed' ? 'selected' : ''}>
                Completed
              </option>
              <option ${item.status === 'Blocked' ? 'selected' : ''}>
                Blocked
              </option>
              <option ${item.status === 'On Leave' ? 'selected' : ''}>
                On Leave
              </option>
            </select>
          </div>

          <div class="field full">
            <label>Notes</label>
            <textarea name="notes">${escapeHtml(item.notes || '')}</textarea>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn" data-action="close-modal">
            Cancel
          </button>
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
    .querySelector('#json-file')
    ?.addEventListener('change', importJson);

  document
    .querySelectorAll('.card[draggable="true"]')
    .forEach(card =>
      card.addEventListener('dragstart', event =>
        event.dataTransfer.setData('text/plain', card.dataset.id)
      )
    );

  document.querySelectorAll('.day-cell').forEach(cell => {
    cell.addEventListener('dragover', event => {
      if (!isAdmin()) return;
      event.preventDefault();
      cell.classList.add('drag-over');
    });

    cell.addEventListener('dragleave', () =>
      cell.classList.remove('drag-over')
    );

    cell.addEventListener('drop', event => {
      event.preventDefault();
      cell.classList.remove('drag-over');

      moveItem(
        event.dataTransfer.getData('text/plain'),
        Number(cell.dataset.week),
        cell.dataset.day
      );
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

async function submitItem(event) {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const existing = state.items.find(
    item => String(item.id) === String(form.get('id'))
  );

  const item = {
    ...(existing || {}),
    id: form.get('id') || undefined,
    title: form.get('title').trim(),
    week: Number(form.get('week')),
    day: form.get('day'),
    status: form.get('status'),
    notes: form.get('notes').trim(),
    sort_order: existing?.sort_order || Date.now()
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
        ({ title, week, day, status, notes, sort_order }) => ({
          title,
          week: Number(week),
          day,
          status,
          notes: notes || '',
          sort_order: Number(sort_order || Date.now())
        })
      );

      const { error } = await supabase.from('build_items').insert(rows);
      if (error) throw error;

      await loadItems();
    } else {
      state.items = parsed;
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

  await loadItems();
}

init();
