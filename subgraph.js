
// subgraph.js
// Main showSubgraph logic (no imports/exports; global-scope functions)

/* global vis, fullData, fieldVisibility, shouldExpandField,
          makeLabel, getTypeColor,
          ensureTooltipDiv, bindNetworkEvents, showTooltip, hideTooltip */

function showSubgraph(centerId, clear) {
  if (clear === undefined) clear = true;

  // Track which nodes/edges already exist to avoid duplicates
  var addedNodes = new Set(clear ? [] : network.body.data.nodes.getIds());
  var addedEdges = new Set(
    clear ? [] : network.body.data.edges.get().map(function(e) {
      return e.from + '->' + e.to;
    })
  );

  // If clear = true, start fresh arrays; otherwise reuse existing data
  var nodeItems = clear ? [] : network.body.data.nodes.get();
  var edgeItems = clear ? [] : network.body.data.edges.get();

  function addNode(id) {
    if (addedNodes.has(id)) return;
    var obj = fullData[id];
    if (!obj) return;
    addedNodes.add(id);
    var type = (obj.__meta && obj.__meta.type) || '?';
    nodeItems.push({
      id: id,
      label: makeLabel(id, obj),
      color: getTypeColor(type),
      isExpanded: false
    });
  }

  function addEdge(from, to, label) {
    if (label === undefined) label = '';
    var key = from + '->' + to;
    if (addedEdges.has(key)) return;
    addedEdges.add(key);
    edgeItems.push({ from: from, to: to, arrows: 'to', label: label });
  }

  // Always add the center node first
  addNode(centerId);
  var obj = fullData[centerId];

  /*── Outgoing references: arrays or single __ref ────────────────────*/
  Object.entries(obj).forEach(function(entry) {
    var key = entry[0], val = entry[1];
    if (!shouldExpandField(obj.__meta && obj.__meta.type, key)) return;

    if (Array.isArray(val)) {
      var allRefs = val
        .filter(function(v) { return v && typeof v === 'object' && '__ref' in v; })
        .map(function(v) { return v.__ref; });
      if (allRefs.length === 0) return;

      var virtualId = centerId + '::field::' + key;
      if (!addedNodes.has(virtualId)) {
        var initial = allRefs.slice(0, THRESHOLD);
        var remaining = allRefs.slice(THRESHOLD);
        nodeItems.push({
          id: virtualId,
          label: '[' + key + ']' + (remaining.length > 0 ? '…' : ''),
          color: '#eeeeee',
          proxy: true,
          isExpanded: false,
          remaining: remaining,
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

      allRefs.slice(0, THRESHOLD).forEach(function(refId) {
        if (!(refId in fullData)) return;
        addNode(refId);
        addEdge(centerId + '::field::' + key, refId);
      });
    }
    else if (val && typeof val === 'object' && '__ref' in val) {
      var refId = val.__ref;
      if (refId in fullData) {
        addNode(refId);
        addEdge(centerId, refId, key);
      }
    }
  });

  /*── Incoming references: nodes pointing back to this center ───────*/
  var incoming = (obj.__meta && obj.__meta.incoming) || [];
  if (incoming.length > THRESHOLD) {
    var virtualId = centerId + '::incoming';
    var initial = incoming.slice(0, THRESHOLD);
    var remaining = incoming.slice(THRESHOLD);
    if (!addedNodes.has(virtualId)) {
      nodeItems.push({
        id: virtualId,
        label: '[incoming]' + (remaining.length > 0 ? '…' : ''),
        color: '#eeeeee',
        proxy: true,
        isExpanded: false,
        remaining: remaining,
        targetId: centerId
      });
      edgeItems.push({ from: virtualId, to: centerId, arrows: 'to', label: '' });
    }
    initial.forEach(function(d) {
      var fromId = d.id, field = d.field;
      if (!(fromId in fullData)) return;
      addNode(fromId);
      addEdge(fromId, virtualId, field);
    });
  }
  else {
    incoming.forEach(function(d) {
      var fromId = d.id, field = d.field;
      if (!(fromId in fullData)) return;
      addNode(fromId);
      addEdge(fromId, centerId, field);
    });
  }

  /*── Build vis.js DataSets ────────────────────────────────────*/
  var visNodes = new vis.DataSet(nodeItems);
  var visEdges = new vis.DataSet(edgeItems);

  if (clear || !network) {
    // First time or clearing: create the Network
    network = new vis.Network(
      document.getElementById('network'),
      { nodes: visNodes, edges: visEdges },
      {
        layout: { improvedLayout: false },
        interaction: { hover: false },
        physics: { stabilization: true }
      }
    );

    // **NEW**: Initialize tooltip + events
    ensureTooltipDiv();
    bindNetworkEvents(network);
  }
  else {
    // Subsequent calls just update data
    network.setData({ nodes: visNodes, edges: visEdges });
  }

  // Reset zoom/pan to show the entire current subgraph
  network.moveTo({ scale: 1.0 });
}
