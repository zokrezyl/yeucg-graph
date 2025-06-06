
// graph.js – full file with click‐based tooltip and “Delete Orphan Nodes” under Fields menu
// -----------------------------------------------------------------------------
// Public functions:
//
//   • showSubgraph(centerId, clear = true)
//   • expandProxyNode(id)
//
// This version is identical to your last working copy, with one addition:
// a small dropdown menu under the existing “☰ Fields” button containing:
//   1. “Show/Hide Fields Panel”
//   2. “Delete Orphan Nodes”
//
// All other logic (tooltip on click, expand on double‐click, proxy nodes, context‐menu delete, etc.)
// remains exactly as before.

/* global vis, fullData, fieldVisibility, shouldExpandField, makeLabel, getTypeColor */

 // (Assumes `network` is declared in another module)

let tooltipDiv = null;
function ensureTooltipDiv() {
  if (tooltipDiv) return;
  tooltipDiv = document.createElement('div');
  Object.assign(tooltipDiv.style, {
    position: 'fixed',
    zIndex: 1001,
    maxWidth: '300px',
    whiteSpace: 'pre',   // preserve line breaks from makeLabel
    background: 'rgba(255,255,255,0.9)',
    border: '1px solid #999',
    borderRadius: '4px',
    padding: '4px 6px',
    fontSize: '0.75em',
    fontFamily: 'monospace',
    pointerEvents: 'none', // click through
    display: 'none'
  });
  document.body.appendChild(tooltipDiv);
}

/*───────────────────────────────────────────────────────────────────
  New: Create a dropdown menu for the “☰ Fields” button, if present.
───────────────────────────────────────────────────────────────────*/
(function setupFieldsMenu() {
  const btn = document.getElementById('field-toggle-btn');
  if (!btn) return;

  // Create menu container
  let menu = document.getElementById('field-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'field-menu';
    Object.assign(menu.style, {
      position: 'fixed',
      top: '36px',    // just below the button
      right: '8px',
      zIndex: 1000,
      background: 'white',
      border: '1px solid #999',
      borderRadius: '4px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
      display: 'none',
      fontSize: '0.85em',
      fontFamily: 'sans-serif'
    });

    // Item: Show/Hide Fields Panel
    const toggleItem = document.createElement('div');
    toggleItem.textContent = 'Show/Hide Fields Panel';
    Object.assign(toggleItem.style, {
      padding: '6px 12px',
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    });
    toggleItem.onmouseenter = () => toggleItem.style.background = '#f0f0f0';
    toggleItem.onmouseleave = () => toggleItem.style.background = '';
    toggleItem.onclick = () => {
      const panel = document.getElementById('field-controls');
      if (!panel) return;
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
      menu.style.display  = 'none';
    };
    menu.appendChild(toggleItem);

    // Item: Delete Orphan Nodes
    const deleteOrphansItem = document.createElement('div');
    deleteOrphansItem.textContent = 'Delete Orphan Nodes';
    Object.assign(deleteOrphansItem.style, {
      padding: '6px 12px',
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    });
    deleteOrphansItem.onmouseenter = () => deleteOrphansItem.style.background = '#f0f0f0';
    deleteOrphansItem.onmouseleave = () => deleteOrphansItem.style.background = '';
    deleteOrphansItem.onclick = () => {
      if (!network) return;
      const edges = network.body.data.edges.get();
      const connected = new Set();
      edges.forEach(e => {
        connected.add(e.from);
        connected.add(e.to);
      });
      const allNodes = network.body.data.nodes.get();
      const orphanIds = allNodes
        .map(n => n.id)
        .filter(id => !connected.has(id));
      if (orphanIds.length > 0) {
        network.body.data.nodes.remove(orphanIds);
      }
      menu.style.display = 'none';
    };
    menu.appendChild(deleteOrphansItem);

    document.body.appendChild(menu);

    // Clicking outside hides menu
    document.addEventListener('click', evt => {
      if (!btn.contains(evt.target) && !menu.contains(evt.target)) {
        menu.style.display = 'none';
      }
    });
  }

  // Button toggles menu
  btn.onclick = evt => {
    evt.stopPropagation();
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
  };
})();

/*───────────────────────────────────────────────────────────────────
  showSubgraph – renders nodes & edges around a centerId
───────────────────────────────────────────────────────────────────*/
function showSubgraph(centerId, clear = true) {
  const addedNodes = new Set(clear ? [] : network?.body?.data?.nodes.getIds());
  const addedEdges = new Set(
    clear ? [] : network?.body?.data?.edges.get().map(e => `${e.from}->${e.to}`)
  );

  const nodeItems = clear ? [] : network.body.data.nodes.get();
  const edgeItems = clear ? [] : network.body.data.edges.get();

  function addNode(id) {
    if (addedNodes.has(id)) return;
    const obj = fullData[id];
    if (!obj) return;
    addedNodes.add(id);
    const type = obj.__meta?.type || '?';
    nodeItems.push({
      id,
      label: makeLabel(id, obj),
      color: getTypeColor(type),
      isExpanded: false
    });
  }

  function addEdge(from, to, label = '') {
    const key = `${from}->${to}`;
    if (addedEdges.has(key)) return;
    addedEdges.add(key);
    edgeItems.push({ from, to, arrows: 'to', label });
  }

  addNode(centerId);
  const obj = fullData[centerId];

  /*── Outgoing references: arrays or single __ref ────────────────────*/
  for (const [key, val] of Object.entries(obj)) {
    if (!shouldExpandField(obj.__meta?.type, key)) continue;

    if (Array.isArray(val)) {
      const allRefs = val
        .filter(v => v && typeof v === 'object' && '__ref' in v)
        .map(v => v.__ref);
      if (allRefs.length === 0) continue;

      const virtualId = `${centerId}::field::${key}`;
      if (!addedNodes.has(virtualId)) {
        const initial   = allRefs.slice(0, THRESHOLD);
        const remaining = allRefs.slice(THRESHOLD);
        nodeItems.push({
          id: virtualId,
          label: `[${key}]${remaining.length > 0 ? '…' : ''}`,
          color: '#eeeeee',
          proxy: true,
          isExpanded: false,
          remaining,
          sourceId: centerId,
          field: key
        });
        edgeItems.push({
          from: centerId,
          to: virtualId,
          arrows: 'to',
          label: key
        });
      }

      for (const refId of allRefs.slice(0, THRESHOLD)) {
        if (!(refId in fullData)) continue;
        addNode(refId);
        addEdge(`${centerId}::field::${key}`, refId);
      }
    } else if (val && typeof val === 'object' && '__ref' in val) {
      const refId = val.__ref;
      if (refId in fullData) {
        addNode(refId);
        addEdge(centerId, refId, key);
      }
    }
  }

  /*── Incoming references: nodes pointing back to this center ───────*/
  const incoming = obj.__meta?.incoming || [];
  if (incoming.length > THRESHOLD) {
    const virtualId = `${centerId}::incoming`;
    const initial   = incoming.slice(0, THRESHOLD);
    const remaining = incoming.slice(THRESHOLD);
    if (!addedNodes.has(virtualId)) {
      nodeItems.push({
        id: virtualId,
        label: `[incoming]${remaining.length > 0 ? '…' : ''}`,
        color: '#eeeeee',
        proxy: true,
        isExpanded: false,
        remaining,
        targetId: centerId
      });
      edgeItems.push({ from: virtualId, to: centerId, arrows: 'to', label: '' });
    }
    for (const { id: fromId, field } of initial) {
      if (!(fromId in fullData)) continue;
      addNode(fromId);
      addEdge(fromId, virtualId, field);
    }
  } else {
    for (const { id: fromId, field } of incoming) {
      if (!(fromId in fullData)) continue;
      addNode(fromId);
      addEdge(fromId, centerId, field);
    }
  }

  /*── Build vis.js DataSets ────────────────────────────────────*/
  const visNodes = new vis.DataSet(nodeItems);
  const visEdges = new vis.DataSet(edgeItems);

  if (clear || !network) {
    // First time or clearing: create the Network
    network = new vis.Network(
      document.getElementById('network'),
      { nodes: visNodes, edges: visEdges },
      {
        layout: { improvedLayout: false },
        interaction: { hover: false }, // hover disabled (tooltip on click)
        physics: { stabilization: true }
      }
    );

    /* Single-click: show/hide tooltip based on clicked node */
    ensureTooltipDiv();
    let clickTimeout = null;
    const CLICK_DELAY = 200; // ms

    network.on('click', params => {
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
      }
      clickTimeout = setTimeout(() => {
        clickTimeout = null;
        // If click on empty space, hide tooltip
        if (!params.nodes || params.nodes.length === 0) {
          tooltipDiv.style.display = 'none';
          return;
        }

        const nodeId = params.nodes[0];
        const node   = network.body.data.nodes.get(nodeId);
        if (!node) return;

        // Determine “real” ID for expanded label
        const realId = node.proxy ? node.sourceId || node.targetId : nodeId;
        const obj    = fullData[realId] || {};

        // Generate the full expanded label
        tooltipDiv.textContent = makeLabel(nodeId, obj, true, !!node.proxy);

        // Position tooltip near the click using srcEvent coordinates
        const evt = params.event && params.event.srcEvent;
        if (evt) {
          tooltipDiv.style.left  = `${evt.pageX + 8}px`;
          const yPos = evt.pageY - 12;
          tooltipDiv.style.top   = yPos < 0 ? '4px' : `${yPos}px`;
        }
        tooltipDiv.style.display = 'block';
      }, CLICK_DELAY);
    });

    /* Double-click: proxy → expand next batch; real → subgraph drill‐down */
    network.on('doubleClick', params => {
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
      }
      tooltipDiv.style.display = 'none';

      if (!params.nodes || params.nodes.length === 0) return;
      const nodeId = params.nodes[0];
      const node   = network.body.data.nodes.get(nodeId);
      if (!node) return;

      if (node.proxy) {
        expandProxyNode(nodeId);
      } else {
        showSubgraph(nodeId, false);
      }
    });

    /* Right-click (contextmenu): remove node and its edges */
    network.on('oncontext', params => {
      const pointer = network.getNodeAt(params.pointer.DOM);
      if (!pointer) return;
      params.event.preventDefault();
      network.body.data.nodes.remove(pointer);
      const toRemove = network.body.data.edges
        .get()
        .filter(e => e.from === pointer || e.to === pointer)
        .map(e => e.id);
      network.body.data.edges.remove(toRemove);
    });
  } else {
    // Subsequent calls (clear=false) just update the data
    network.setData({ nodes: visNodes, edges: visEdges });
  }

  // Always reset zoom/pan to show the full current subgraph
  network.moveTo({ scale: 1.0 });
}

/*───────────────────────────────────────────────────────────────────
  expandProxyNode – adds the next batch of children under a proxy
───────────────────────────────────────────────────────────────────*/
function expandProxyNode(id) {
  const node = network.body.data.nodes.get(id);
  if (!node || !node.remaining || node.remaining.length === 0) return;

  const newNodes = [];
  const newEdges = [];
  const nextBatch = node.remaining.splice(0, THRESHOLD);

  for (const refId of nextBatch) {
    if (!(refId in fullData)) continue;
    const obj = fullData[refId];
    newNodes.push({
      id: refId,
      label: makeLabel(refId, obj),
      color: getTypeColor(obj.__meta?.type || '?')
    });
    newEdges.push({ from: id, to: refId, arrows: 'to' });
  }

  node.label = node.label.replace(/[…]?$|$/, node.remaining.length > 0 ? '…' : '');
  network.body.data.nodes.update(node);
  network.body.data.nodes.add(newNodes);
  network.body.data.edges.add(newEdges);
}
