
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
    showSubgraph(rootId, true);         // Start with first node
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

function makeLabel(id, obj, isExpanded = false, isProxy = false) {
  const type = obj.__meta?.type || '?';
  const kind = obj.kind || '';
  const kindShort = kind.replace(/^(CursorKind|TypeKind)\./, '');
  const name = obj.name || obj.displayname || obj.spelling || '';
  const line1 = name ? name : '';
  const line2 = `(${id}::${type}${kindShort ? '/' + kindShort : ''})`;
  let header = line1 ? `${line1}\n${line2}` : line2;
  if (!isExpanded) return header;

  if (isProxy) {
    return `❌ ${header}`;
  }

  const fields = Object.entries(obj)
    .filter(([k]) => k !== '__meta')
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        const isRefArray = v.some(x => typeof x === 'object' && x.__ref);
        return `${k}: ${isRefArray ? '[]->' : '[…]'}`;
      } else if (v && typeof v === 'object' && '__ref' in v) {
        return `${k}: ->`;
      } else {
        return `${k}: ${JSON.stringify(v)}`;
      }
    });

  return `❌ ${[header, ...fields].filter(Boolean).join('\n')}`;
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
  console.clear();
  console.log('Opening node:', centerId);

  const addedNodes = new Set(clear ? [] : network.body.data.nodes.getIds());
  const addedEdges = new Set(clear ? [] : network.body.data.edges.getIds().map(eid => {
    const e = network.body.data.edges.get(eid);
    return `${e.from}->${e.to}`;
  }));

  const nodeItems = clear ? [] : network.body.data.nodes.get();
  const edgeItems = clear ? [] : network.body.data.edges.get();

  function addNode(id) {
    if (addedNodes.has(id)) return;
    const obj = fullData[id];
    if (!obj) return;
    addedNodes.add(id);
    const type = obj.__meta?.type || '?';
    nodeItems.push({ id, label: makeLabel(id, obj), color: getTypeColor(type), isExpanded: false });
  }

  function addEdge(from, to, label = '') {
    const key = `${from}->${to}`;
    if (addedEdges.has(key)) return;
    addedEdges.add(key);
    edgeItems.push({ from, to, arrows: 'to', label });
  }

  addNode(centerId);
  const obj = fullData[centerId];

  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      const virtualId = `${centerId}::field::${key}`;
      if (!addedNodes.has(virtualId)) {
        const allRefs = val.filter(v => v && typeof v === 'object' && '__ref' in v).map(v => v.__ref);
        const initial = allRefs.slice(0, THRESHOLD);
        const remaining = allRefs.slice(THRESHOLD);

        nodeItems.push({ id: virtualId, label: `[${key}]${remaining.length > 0 ? '…' : ''}`, color: '#eeeeee', proxy: true, isExpanded: false, remaining, sourceId: centerId, field: key });
        edgeItems.push({ from: centerId, to: virtualId, arrows: 'to', label: key });
      }

      for (const refId of val.map(v => v.__ref).slice(0, THRESHOLD)) {
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

  const incoming = fullData[centerId].__meta.incoming || [];
  if (incoming.length > THRESHOLD) {
    const virtualId = `${centerId}::incoming`;
    const initial = incoming.slice(0, THRESHOLD);
    const remaining = incoming.slice(THRESHOLD);
    if (!addedNodes.has(virtualId)) {
      nodeItems.push({ id: virtualId, label: `[incoming]${remaining.length > 0 ? '…' : ''}`, color: '#eeeeee', proxy: true, isExpanded: false, remaining, targetId: centerId });
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

  const visNodes = new vis.DataSet(nodeItems);
  const visEdges = new vis.DataSet(edgeItems);

  if (clear || !network) {
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
      if (network.isCluster(nodeId)) {
        network.openCluster(nodeId);
      } else if (node.proxy) {
        expandProxyNode(nodeId);
      } else {
        showSubgraph(nodeId, true);
      }
    });

    network.on('click', function (params) {
      if (params.nodes.length === 0) return;
      const nodeId = params.nodes[0];
      const node = network.body.data.nodes.get(nodeId);
      if (!node) return;
      if (node.isExpanded) {
        if (node.label.startsWith('❌')) {
          network.body.data.nodes.remove(nodeId);
          const edgesToRemove = network.body.data.edges.get().filter(e => e.from === nodeId || e.to === nodeId).map(e => e.id);
          network.body.data.edges.remove(edgesToRemove);
        }
        return;
      }
      const obj = fullData[node.proxy ? node.sourceId || node.targetId : nodeId] || {};
      node.isExpanded = true;
      node.label = makeLabel(nodeId, obj, true, !!node.proxy);
      network.body.data.nodes.update(node);
    });
  } else {
    network.setData({ nodes: visNodes, edges: visEdges });
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

  node.label = node.label.replace(/[…]?$|$/, node.remaining.length > 0 ? '…' : '');
  network.body.data.nodes.update(node);
  network.body.data.nodes.add(newNodes);
  network.body.data.edges.add(newEdges);
}
