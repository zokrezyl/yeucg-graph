
// graph.js – full file, single-click now expands / drills-down
// -----------------------------------------------------------------------------
// Public functions:
//
//   • showSubgraph(centerId, clear = true)
//   • expandProxyNode(id)
//
// Changes in this version:
//   • 'click' handler now does what 'doubleClick' did:
//       • proxy node  → expandProxyNode()
//       • real node   → showSubgraph(nodeId, false)
//   • 'doubleClick' handler disabled to avoid duplicate actions.
//   • Removed label-toggle-on-click logic.
//
// Hover tooltip logic and all previous fixes remain.

/* global vis, fullData, fieldVisibility, shouldExpandField, makeLabel, getTypeColor */


/*───────────────────────────────────────────────────────────────────
  Tooltip helper – unchanged
───────────────────────────────────────────────────────────────────*/
let tooltipDiv = null;
function ensureTooltipDiv() {
  if (tooltipDiv) return;
  tooltipDiv = document.createElement('div');
  Object.assign(tooltipDiv.style, {
    position: 'fixed',
    zIndex: 1001,
    maxWidth: '300px',
    whiteSpace: 'pre',
    background: 'rgba(255,255,255,0.9)',
    border: '1px solid #999',
    borderRadius: '4px',
    padding: '4px 6px',
    fontSize: '0.75em',
    fontFamily: 'monospace',
    pointerEvents: 'none',
    display: 'none'
  });
  document.body.appendChild(tooltipDiv);
}

/*───────────────────────────────────────────────────────────────────
  showSubgraph – unchanged except earlier tweaks (skip empty arrays)
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

  /*── outgoing references ──────────────────────────────────────*/
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

  /*── incoming references – unchanged ──────────────────────────*/
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

  /*── build vis.js datasets ────────────────────────────────────*/
  const visNodes = new vis.DataSet(nodeItems);
  const visEdges = new vis.DataSet(edgeItems);

  if (clear || !network) {
    network = new vis.Network(
      document.getElementById('network'),
      { nodes: visNodes, edges: visEdges },
      {
        layout: { improvedLayout: false },
        interaction: { hover: true },
        physics: { stabilization: true }
      }
    );

    /* double-click (disabled to prevent duplicate action) */
    network.on('doubleClick', () => {
      /* intentionally left blank */
    });

    /* SINGLE click – now handles expand/drill-down */
    network.on('click', params => {
      if (params.nodes.length === 0) return;
      const nodeId = params.nodes[0];
      const node   = network.body.data.nodes.get(nodeId);
      if (!node) return;

      if (node.proxy) {
        expandProxyNode(nodeId);
      } else {
        showSubgraph(nodeId, false);
      }
    });

    /* hover tool-tip – unchanged */
    ensureTooltipDiv();
    network.on('hoverNode', params => {
      const nodeId = params.node;
      const node   = network.body.data.nodes.get(nodeId);
      if (!node) return;

      const realId = node.proxy ? node.sourceId || node.targetId : nodeId;
      const obj    = fullData[realId] || {};
      tooltipDiv.textContent = makeLabel(nodeId, obj, true, !!node.proxy);
      tooltipDiv.style.left  = `${params.event.pageX + 8}px`;
      tooltipDiv.style.top   = `${params.event.pageY - 12}px`;
      tooltipDiv.style.display = 'block';
    });
    network.on('blurNode', () => {
      tooltipDiv.style.display = 'none';
    });

    /* right-click remove node – unchanged */
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
    network.setData({ nodes: visNodes, edges: visEdges });
  }

  network.moveTo({ scale: 1.0 });
}

/*───────────────────────────────────────────────────────────────────
  expandProxyNode – unchanged
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
