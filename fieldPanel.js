
// fieldPanel.js – full file, columns now ~50% narrower
// -----------------------------------------------------------------------------
// Public functions kept exactly:
//
//   • shouldExpandField(type, field)
//   • updateEdgesByField(type, field, visible)
//   • buildFieldPanel(data)
//
// Helpers:
//   • loadSavedState, saveFieldState, savePanelHiddenState
//   • ensureToggleButton(panel)
//
// Visual tweaks:
//   • Column widths 90-110 px (half of prior 180-220)
//   • Column gap 0.8 rem
//   • Font-size still 0.8 em
//   • All persistence logic untouched

/* global fullData, network, fieldVisibility */

/*──── localStorage helpers ───────────────────────────────────────*/
const LS_KEY_VISIBILITY = 'fieldPanel_visibility';
const LS_KEY_HIDDEN     = 'fieldPanel_hidden';

function loadSavedState() {
  try {
    const vis = JSON.parse(localStorage.getItem(LS_KEY_VISIBILITY) || '{}');
    Object.assign(fieldVisibility, vis);
  } catch (_) {}
}
function saveFieldState() {
  try { localStorage.setItem(LS_KEY_VISIBILITY, JSON.stringify(fieldVisibility)); }
  catch (_) {}
}
function savePanelHiddenState(hidden) {
  try { localStorage.setItem(LS_KEY_HIDDEN, hidden ? '1' : '0'); }
  catch (_) {}
}

/*──── toggle button (top-right) ─────────────────────────────────*/
function ensureToggleButton(panel) {
  let btn = document.getElementById('field-toggle-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'field-toggle-btn';
    btn.textContent = '☰ Fields';
    Object.assign(btn.style, {
      position: 'fixed',
      top: '8px',
      right: '8px',
      zIndex: 1000,
      padding: '4px 8px',
      fontSize: '0.9em',
      cursor: 'pointer'
    });
    document.body.appendChild(btn);
  }
  btn.onclick = () => {
    const nowHidden = panel.dataset.hidden !== 'true';
    panel.dataset.hidden = nowHidden ? 'true' : 'false';
    panel.style.display  = nowHidden ? 'none' : 'flex';
    savePanelHiddenState(nowHidden);
  };
}

/*──── shouldExpandField (unchanged) ─────────────────────────────*/
function shouldExpandField(type, field) {
  return !fieldVisibility[type] || fieldVisibility[type][field];
}

/*──── updateEdgesByField (unchanged, plus persistence) ─────────*/
function updateEdgesByField(type, field, visible) {
  const allEdges = network.body.data.edges.get();
  for (const edge of allEdges) {
    const fromNode = network.body.data.nodes.get(edge.from);
    const fromId   = fromNode?.sourceId || fromNode?.id;
    const match =
      edge.label === field && fullData[fromId]?.__meta?.type === type;
    if (match) {
      visible
        ? network.body.data.edges.add(edge)
        : network.body.data.edges.remove(edge.id);
    }
  }
  saveFieldState();
}

/*──── buildFieldPanel (column width + gap adjusted) ─────────────*/
function buildFieldPanel(data) {
  const panel = document.getElementById('field-controls');
  if (!panel) return;

  /* one-time setup */
  if (!panel.dataset.initialised) {
    loadSavedState();
    if (localStorage.getItem(LS_KEY_HIDDEN) === '1') {
      panel.dataset.hidden = 'true';
      panel.style.display  = 'none';
    }
    panel.dataset.initialised = 'true';
  }
  ensureToggleButton(panel);

  const hidden = panel.dataset.hidden === 'true';
  panel.innerHTML      = '';
  panel.style.fontSize = '0.8em';
  panel.style.display  = hidden ? 'none' : 'flex';
  panel.style.flexWrap = 'wrap';
  panel.style.alignItems = 'flex-start';
  panel.style.gap        = '0.8rem';   // narrower gap

  /* gather type → fieldsWithRefs */
  const typeFields = {};
  for (const obj of Object.values(data)) {
    const type = obj.__meta?.type;
    if (!type) continue;
    typeFields[type] ??= new Set();
    for (const [key, val] of Object.entries(obj)) {
      if (key === '__meta') continue;
      const hasRef =
        (Array.isArray(val) &&
          val.some(v => v && typeof v === 'object' && '__ref' in v)) ||
        (val && typeof val === 'object' && '__ref' in val);
      if (hasRef) typeFields[type].add(key);
    }
  }

  /* build columns */
  for (const [type, fields] of Object.entries(typeFields)) {
    fieldVisibility[type] ??= {};

    const col = document.createElement('div');
    Object.assign(col.style, {
      minWidth: '90px',     // ← narrower
      maxWidth: '110px',    // ← narrower
      flexShrink: '0'
    });

    const header = document.createElement('div');
    header.textContent = type;
    Object.assign(header.style, {
      fontWeight: 'bold',
      marginBottom: '0.3em'
    });
    col.appendChild(header);

    const ul = document.createElement('ul');
    Object.assign(ul.style, {
      listStyle: 'none',
      padding: '0',
      margin: '0'
    });
    col.appendChild(ul);

    [...fields].sort().forEach(field => {
      fieldVisibility[type][field] ??= true;

      const li = document.createElement('li');
      li.style.marginTop = '0.35em';

      const label = document.createElement('label');
      label.style.cursor = 'pointer';

      const input = document.createElement('input');
      input.type    = 'checkbox';
      input.checked = fieldVisibility[type][field];
      input.onchange = () => {
        fieldVisibility[type][field] = input.checked;
        updateEdgesByField(type, field, input.checked);
      };

      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + field));
      li.appendChild(label);
      ul.appendChild(li);
    });

    panel.appendChild(col);
  }

  /* save defaults (first render) */
  saveFieldState();
}
