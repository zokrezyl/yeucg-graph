
// graph.js – full file
// -----------------------------------------------------------------------------
// Public functions:
//
//   • showSubgraph(centerId, clear = true)
//   • expandProxyNode(id)
//
// Event handling changes:
//   • Double-click: proxy → expandProxyNode; real node → showSubgraph(clear=false)
//   • Click: proxy nodes do nothing; real nodes toggle label.
//
// All underlying logic (skip empty arrays, THRESHOLD, etc.) remains the same.

/* global vis, fullData, fieldVisibility, shouldExpandField, makeLabel, getTypeColor */


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

  /*── outgoing references ──────────────────────────────────────*/
  for (const [key, val] of Object.entries(obj)) {
    if (!shouldExpandField(obj.__meta?.type, key)) continue;

    if (Array.isArray(val)) {
      /* Skip arrays with no refs */
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

  /*── incoming references ──────────────────────────────────────*/
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

    /* double-click: expand proxy OR add subgraph */
    network.on('doubleClick', params => {
      if (params.nodes.length === 0) return;
      const nodeId = params.nodes[0];
      const node   = network.body.data.nodes.get(nodeId);
      if (!node) return;

      if (node.proxy) {
        expandProxyNode(nodeId);         // just expand batch
      } else {
        showSubgraph(nodeId, false);     // keep existing graph
      }
    });

    /* single click: toggle label only for real nodes */
    network.on('click', params => {
      if (params.nodes.length === 0) return;
      const nodeId = params.nodes[0];
      const node   = network.body.data.nodes.get(nodeId);
      if (!node || node.proxy) return;   // ignore proxies

      const obj = fullData[nodeId] || {};
      node.isExpanded = !node.isExpanded;
      node.label = makeLabel(nodeId, obj, node.isExpanded, false);
      network.body.data.nodes.update(node);
    });

    /* right-click remove node (unchanged) */
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
