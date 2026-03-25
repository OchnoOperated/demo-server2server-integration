/* eslint-disable no-undef */

// ── API helper ────────────────────────────────────────────────────────────────
// All requests go to our own Express server which proxies to Ochno + injects auth.

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = '/login';
    return null;
  }
  if (!res.ok) throw Object.assign(new Error(`API error ${res.status}`), { status: res.status });
  return res.json();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Set active port ───────────────────────────────────────────────────────────

async function setActivePort(hubId, port) {
  try {
    await api(`/api/hubs/${hubId}/state`, {
      method: 'PUT',
      body: JSON.stringify({ activeport: port }),
    });
  } catch (err) {
    showError(`Failed to set active port: ${err.message}`);
  }
}

function hubTitle(hub) {
  return hub.name || hub.customid || hub.hwId || hub.serialNumber || '—';
}

function showError(message) {
  const box = document.querySelector('#error-box');
  box.textContent = message;
  box.style.display = 'block';
}

function el(id) { return document.getElementById(id); }

// ── Render: user ──────────────────────────────────────────────────────────────

function renderUser(user) {
  const name = user.name || user.email || user.sub || 'Unknown';
  const initials = name.split(/[\s@]/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  el('user-avatar').textContent = initials;
  el('user-name').textContent = name;
  el('user-email').textContent = user.email ?? '';
  el('header-email').textContent = user.email ?? '';
}

// ── Render: account groups ────────────────────────────────────────────────────

function renderGroups(groups) {
  const list = el('groups-list');
  if (!groups.length) {
    list.innerHTML = '<div class="panel__empty">No groups found</div>';
    return;
  }
  list.innerHTML = groups.map((g) => `
    <div class="list-item" style="cursor:default">
      <div class="list-item__icon">👥</div>
      <div class="list-item__body">
        <div class="list-item__name">${g.name ?? '—'}</div>
        <div class="list-item__sub">${g.id ?? ''}</div>
      </div>
    </div>
  `).join('');
}

// ── Render: spaces ────────────────────────────────────────────────────────────

function renderSpaces(spaces) {
  el('spaces-count').textContent = spaces.length;
  const list = el('spaces-list');
  if (!spaces.length) {
    list.innerHTML = '<div class="panel__empty">No spaces found</div>';
    return;
  }

  // Populate space filter dropdown too
  const filter = el('space-filter');
  for (const space of spaces) {
    const opt = document.createElement('option');
    opt.value = space.id;
    opt.textContent = space.name ?? space.id;
    filter.append(opt);
  }

  list.innerHTML = spaces.map((s) => `
    <div class="list-item" style="cursor:default">
      <div class="list-item__icon">🏠</div>
      <div class="list-item__body">
        <div class="list-item__name">${s.name ?? '—'}</div>
        <div class="list-item__sub">${s.id}</div>
      </div>
    </div>
  `).join('');
}

// ── Render: hubs list ─────────────────────────────────────────────────────────

function renderHubs(hubs) {
  el('hubs-count').textContent = hubs.length;
  const list = el('hubs-list');
  if (!hubs.length) {
    list.innerHTML = '<div class="panel__empty">No hubs found</div>';
    return;
  }
  list.innerHTML = '';
  for (const hub of hubs) {
    const online = hub.data?.presence === true;
    const item = document.createElement('div');
    item.className = 'list-item';
    item.dataset.hubId = hub.id;
    item.innerHTML = `
      <div class="list-item__icon">🔌</div>
      <div class="list-item__body">
        <div class="list-item__name" style="display:flex;align-items:center;gap:6px">
          <span class="dot ${online ? '-online' : '-offline'}"></span>
          ${hubTitle(hub)}
        </div>
        <div class="list-item__sub">${hub.serialNumber ?? hub.id ?? ''}</div>
      </div>
      <span class="list-item__arrow">›</span>
    `;
    item.addEventListener('click', () => openDrawer(hub.id, hubTitle(hub)));
    list.append(item);
  }
}

// ── Port tiles ────────────────────────────────────────────────────────────────

function buildPortTiles(state, hubId) {
  const connected = state.connected ?? [];
  const active = state.active;
  const grid = document.createElement('div');
  grid.className = 'port-grid';

  for (let p = 1; p <= 4; p++) {
    const isActive    = active === p;
    const isConnected = connected[p - 1] === 1;

    const tile = document.createElement('div');
    tile.className = `port-tile ${isActive ? '-active' : ''} ${isConnected ? '-connected' : ''}`;
    tile.style.cursor = 'pointer';
    tile.title = isActive ? 'Click to deactivate' : 'Click to set active';
    tile.innerHTML = `
      <div class="port-tile__label">USB${p}</div>
      <div class="port-tile__status">${isActive ? 'Active' : isConnected ? 'Connected' : 'Empty'}</div>
    `;

    tile.addEventListener('click', () => {
      // Toggle: clicking active port sends 0, clicking inactive sends port number
      setActivePort(hubId, isActive ? 0 : p);
    });

    grid.append(tile);
  }

  return grid;
}

let activeHubId = null;

window.closeDrawer = function () {
  activeHubId = null;
  el('hub-drawer').classList.remove('-open');
  document.querySelectorAll('#hubs-list .list-item.-active').forEach((i) => i.classList.remove('-active'));
};

async function openDrawer(hubId, title) {
  activeHubId = hubId;

  // Highlight in list
  document.querySelectorAll('#hubs-list .list-item').forEach((i) => i.classList.remove('-active'));
  document.querySelector(`[data-hub-id="${hubId}"]`)?.classList.add('-active');

  el('drawer-title').textContent = title;
  el('drawer-id').textContent = hubId;
  el('drawer-content').innerHTML = '<div class="panel__placeholder">Loading…</div>';
  el('hub-drawer').classList.add('-open');

  try {
    const hub = await api(`/api/hubs/${hubId}`);
    if (!hub) return;
    renderDrawer(hub);
  } catch (err) {
    el('drawer-content').innerHTML = `<div class="panel__empty" style="color:var(--color-error)">Failed to load hub: ${err.message}</div>`;
  }
}

// Updates only the port grid — called from socket.io events, no re-fetch needed
function updatePortState(state) {
  const existingGrid = el('hub-drawer')?.querySelector('.port-grid');
  if (!existingGrid) return;
  existingGrid.replaceWith(buildPortTiles(state, activeHubId));
}

function renderDrawer(hub) {
  const d = hub.data ?? {};
  const state = d.state ?? {};
  const config = d.config ?? {};
  const connections = d.connections ?? {};
  const connected = state.connected ?? [];

  el('drawer-content').innerHTML = `
    <!-- State section -->
    <div class="drawer__section">
      <div class="drawer__section-title">Port state</div>
      <div id="port-grid-container"></div>
    </div>

    <!-- Info section -->
    <div class="drawer__section">
      <div class="drawer__section-title">Device info</div>
      <div class="field-list">
        ${field('Firmware', d.firmware)}
        ${field('IP', d.ip)}
        ${field('Hardware', d.hardwareversion)}
        ${field('Product', d.product)}
        ${field('Custom ID', d.customid)}
        ${field('Serial', hub.serialNumber)}
        ${field('Online', d.presence ? '✓ Yes' : '✗ No')}
      </div>
    </div>

    <!-- Config section -->
    <div class="drawer__section">
      <div class="drawer__section-title">Config</div>
      <div class="field-list">
        ${field('Default port', config.defaultport)}
        ${field('HDMI CEC', config.hdmiceccontrol)}
        ${field('Auto switch', config.autoswitchconnect)}
        ${field('Inactive disabled', Array.isArray(config.inactivedisabled) ? config.inactivedisabled.join(', ') : config.inactivedisabled)}
      </div>
    </div>

    <!-- USB connections section -->
    ${Object.keys(connections).length ? `
    <div class="drawer__section">
      <div class="drawer__section-title">USB connections</div>
      <div class="field-list">
        ${Object.entries(connections).map(([port, con]) => field(port.toUpperCase(), formatConnection(con))).join('')}
      </div>
    </div>` : ''}
  `;

  // Inject interactive port tiles (needs event listeners so can't be innerHTML)
  el('port-grid-container').append(buildPortTiles(state, hub.id));
}

function field(label, value) {
  if (value === undefined || value === null || value === '') return '';
  return `
    <div class="field-row">
      <span class="field-row__label">${label}</span>
      <span class="field-row__value">${value}</span>
    </div>
  `;
}

function formatConnection(con) {
  if (!con) return '—';
  const parts = [];
  if (con.type) parts.push(con.type);
  if (con.connected) parts.push('connected');
  if (con.direction) parts.push(con.direction);
  return parts.join(' · ') || '—';
}

// ── Space filter ──────────────────────────────────────────────────────────────

let allHubs = [];

el('space-filter').addEventListener('change', (e) => {
  const spaceId = e.target.value;
  const filtered = spaceId
    ? allHubs.filter((h) => (h.spaceId ?? []).includes(spaceId))
    : allHubs;
  renderHubs(filtered);
});

// ── Event feed (socket.io) ────────────────────────────────────────────────────

let eventCount = 0;

window.clearEvents = function () {
  eventCount = 0;
  el('events-count').textContent = '0';
  el('event-feed').innerHTML = '<div class="panel__placeholder">Waiting for events…</div>';
};

function appendEvent(event) {
  const feed = el('event-feed');
  // Remove placeholder if present
  const placeholder = feed.querySelector('.panel__placeholder');
  if (placeholder) placeholder.remove();

  eventCount += 1;
  el('events-count').textContent = eventCount;

  const time = new Date().toLocaleTimeString();
  const item = document.createElement('div');
  item.className = 'event-item';
  item.innerHTML = `
    <span class="event-item__time">${time}</span>
    <span class="event-item__type">${event.event ?? 'unknown'}</span>
    <span>${event.hubId ?? event.serialNumber ?? ''}</span>
  `;

  // Prepend so newest is at top
  feed.insertBefore(item, feed.firstChild);

  // Keep max 50 events
  while (feed.children.length > 50) feed.removeChild(feed.lastChild);
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const [authStatus, groups, hubs, spaces, webhookStatus] = await Promise.all([
      api('/auth/status'),
      api('/api/accounts/groups'),
      api('/api/hubs'),
      api('/api/spaces'),
      api('/webhook/status'),
    ]);

    if (authStatus?.authenticated) {
      el('header-email').textContent = 'Server authenticated';
    }

    const groupList = Array.isArray(groups) ? groups : [];
    renderGroups(groupList);

    allHubs = Array.isArray(hubs) ? hubs : [];
    renderHubs(allHubs);

    const spaceList = Array.isArray(spaces) ? spaces : [];
    renderSpaces(spaceList);

    if (webhookStatus?.enabled) {
      el('events-section').style.display = 'block';
      initSocketIO();
    }

  } catch (err) {
    if (err?.status !== 401) {
      showError(`Failed to load data: ${err.message}`);
    }
  }
}

function initSocketIO() {
  // socket.io client is loaded via the script tag in dashboard.html
  const socket = io(); // eslint-disable-line no-undef
  socket.on('connect', () => {
    console.log('[socket.io] Connected to event feed');
  });
  socket.on('hub:event', (event) => {
    appendEvent(event);

    // If the drawer is open for this hub, update port state in real-time
    const eventHubId = event.hubId ?? event.data?.hubId;
    if (activeHubId && eventHubId === activeHubId) {
      if (event.event === 'hub:state:change' && event.data?.newState) {
        updatePortState(event.data.newState);
      } else if (event.event === 'hub:con:change') {
        // Con:change doesn't carry full state — re-fetch to get accurate picture
        api(`/api/hubs/${activeHubId}`).then((hub) => { if (hub) renderDrawer(hub); });
      }
    }
  });
  socket.on('disconnect', () => {
    console.log('[socket.io] Disconnected from event feed');
  });
}

init();