
// Entry point: load JSON file and initialize graph
const dataUrl = './clang.json';
let fullData = {}; // Holds the entire JSON content

const container = document.getElementById('network');
let network;
const THRESHOLD = 10; // Maximum nodes shown initially per group
const nameToIdMap = []; // Search entries

// Fetch and process the JSON file
fetch(dataUrl)
  .then(res => res.json())
  .then(json => {
    fullData = json;
    console.log('Loaded nodes:', Object.keys(json).length);
    buildIncomingReferences(json); // Precompute incoming references
    buildSearchIndex(json);       // Prepare search index
    const rootId = Object.keys(json)[0];
    showSubgraph(rootId, true);   // Start with first node
  });

// Precompute incoming references as { id, field }
function buildIncomingReferences(data) {
  for (const obj of Object.values(data)) {
    if (!obj.__meta) obj.__meta = {};
    obj.__meta.incoming = [];
  }

  let refCount = 0;
  for (const [id, obj] of Object.entries(data)) {
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && '__ref' in item) {
            const refId = item.__ref;
            if (refId in data) {
              data[refId].__meta.incoming.push({ id, field: key });
              refCount++;
            }
          }
        }
      } else if (val && typeof val === 'object' && '__ref' in val) {
        const refId = val.__ref;
        if (refId in data) {
          data[refId].__meta.incoming.push({ id, field: key });
          refCount++;
        }
      }
    }
  }
  console.log('Total references indexed:', refCount);
}

function makeLabel(id, obj) {
  const type = obj.__meta?.type || '?';
  const kind = obj.kind?.replace(/^(CursorKind|TypeKind)\./, '') || '';
  const name = obj.name || obj.displayname || obj.spelling || '';
  const line1 = name ? name : '';
  const line2 = kind ? `(${type}, ${kind})` : `(${type})`;
  const line3 = `(${id})`;
  return [line1, line2, line3].filter(Boolean).join('\n');
}

function getTypeColor(type) {
  const palette = {
    'TranslationUnit': '#FFD966',
    'Cursor': '#A4C2F4',
    'Type': '#D9EAD3',
    'File': '#F4CCCC',
    'SourceLocation': '#D5A6BD',
    'SourceRange': '#B6D7A8',
    '?': '#CCCCCC'
  };
  return palette[type] || '#E0E0E0';
}

function showSubgraph(centerId, clear = true) {
  if (clear) console.clear();
  console.log('Opening node:', centerId);

  const nodeItems = clear ? [] : network.body.data.nodes.get();
  const edgeItems = clear ? [] : network.body.data.edges.get();
  const addedNodes = new Set(nodeItems.map(n => n.id));
  const addedEdges = new Set(edgeItems.map(e => `${e.from}->${e.to}`));
  const visNodes = clear ? new vis.DataSet() : network.body.data.nodes;
  const visEdges = clear ? new vis.DataSet() : network.body.data.edges;

  function addNode(id) {
    if (addedNodes.has(id)) return;
    const obj = fullData[id];
    if (!obj) return;
    addedNodes.add(id);
    const type = obj.__meta?.type || '?';
    visNodes.update({ id, label: makeLabel(id, obj), color: getTypeColor(type) });
  }

  function addEdge(from, to, label = '') {
    const key = `${from}->${to}`;
    if (addedEdges.has(key)) return;
    addedEdges.add(key);
    visEdges.update({ from, to, arrows: 'to', label });
  }

  addNode(centerId);
  const obj = fullData[centerId];

  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      const virtualId = `${centerId}::field::${key}`;
      const allRefs = val.filter(v => v && typeof v === 'object' && '__ref' in v).map(v => v.__ref);
      const initial = allRefs.slice(0, THRESHOLD);
      const remaining = allRefs.slice(THRESHOLD);

      visNodes.update({ id: virtualId, label: `[${key}]`, color: '#eeeeee', proxy: true, remaining, sourceId: centerId, field: key });
      addEdge(centerId, virtualId, key);

      for (const refId of initial) {
        if (!(refId in fullData)) continue;
        addNode(refId);
        addEdge(virtualId, refId);
      }
    } else if (val && typeof val === 'object' && '__ref' in val) {
      const refId = val.__ref;
      if (refId in fullData) {
        addNode(refId);
        addEdge(centerId, refId, key);
      }
    }
  }

  const incoming = fullData[centerId].__meta.incoming || [];
  if (incoming.length > THRESHOLD) {
    const virtualId = `${centerId}::incoming`;
    const initial = incoming.slice(0, THRESHOLD);
    const remaining = incoming.slice(THRESHOLD);

    visNodes.update({ id: virtualId, label: `[incoming]`, color: '#eeeeee', proxy: true, remaining, targetId: centerId });
    addEdge(virtualId, centerId);

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

  if (clear) {
    network = new vis.Network(container, { nodes: visNodes, edges: visEdges }, {
      layout: { improvedLayout: false },
      interaction: { hover: true },
      physics: { stabilization: true }
    });

    network.on('doubleClick', function (params) {
      if (params.nodes.length === 0) return;
      const nodeId = params.nodes[0];
      const node = network.body.data.nodes.get(nodeId);
      if (!node) return;

      if (node.proxy) {
        expandProxyNode(nodeId);
      } else {
        showSubgraph(nodeId, true);
      }
    });
  } else {
    network.body.data.nodes.update(visNodes.get());
    network.body.data.edges.update(visEdges.get());
  }

  network.moveTo({ scale: 1.0 });
}

function expandProxyNode(id) {
  const node = network.body.data.nodes.get(id);
  if (!node || !node.remaining || node.remaining.length === 0) return;

  const newNodes = [];
  const newEdges = [];
  const nextBatch = node.remaining.splice(0, THRESHOLD);

  for (const refId of nextBatch) {
    if (!(refId in fullData)) continue;
    const obj = fullData[refId];
    newNodes.push({ id: refId, label: makeLabel(refId, obj), color: getTypeColor(obj.__meta?.type || '?') });
    newEdges.push({ from: id, to: refId, arrows: 'to' });
  }

  network.body.data.nodes.update({ id, remaining: node.remaining });
  network.body.data.nodes.update(newNodes);
  network.body.data.edges.update(newEdges);

  if (node.remaining.length > 0) {
    const n = network.body.data.nodes.get(id);
    n.label = n.label.replace(/(…)?$/, `… (${node.remaining.length})`);
    network.body.data.nodes.update(n);
  }
}
