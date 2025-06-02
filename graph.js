
// Entry point: load JSON file and initialize graph
const dataUrl = './clang.json';
let fullData = {}; // Holds the entire JSON content

const container = document.getElementById('network');
let network;
const THRESHOLD = 10; // Maximum nodes shown initially per group

// Fetch and process the JSON file
fetch(dataUrl)
  .then(res => res.json())
  .then(json => {
    fullData = json;
    console.log('Loaded nodes:', Object.keys(json).length);
    buildIncomingReferences(json); // Precompute incoming references
    const rootId = Object.keys(json)[0];
    showSubgraph(rootId); // Start with first node
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
  const name = obj.name || obj.displayname || obj.spelling || '';
  const line1 = name ? name : '';
  const line2 = `(${id}::${type})`;
  return line1 ? `${line1}\n${line2}` : line2;
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

function showSubgraph(centerId) {
  console.clear();
  console.log('Opening node:', centerId);

  const addedNodes = new Set();
  const addedEdges = new Set();
  const nodeItems = [];
  const edgeItems = [];

  function addNode(id) {
    if (addedNodes.has(id)) return;
    const obj = fullData[id];
    if (!obj) {
      console.warn(`Missing object for ID: ${id}`);
      return;
    }
    addedNodes.add(id);
    const type = obj.__meta?.type || '?';
    nodeItems.push({ id, label: makeLabel(id, obj), color: getTypeColor(type) });
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
      const allRefs = val.filter(v => v && typeof v === 'object' && '__ref' in v).map(v => v.__ref);
      const initial = allRefs.slice(0, THRESHOLD);
      const remaining = allRefs.slice(THRESHOLD);

      const label = remaining.length > 0 ? `[${key}]\n(click to expand ${remaining.length} more)` : `[${key}]`;
      nodeItems.push({ id: virtualId, label, color: '#eeeeee', proxy: true, remaining, sourceId: centerId, field: key });
      edgeItems.push({ from: centerId, to: virtualId, arrows: 'to', label: key });

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
    const label = `[incoming]\n(click to expand ${remaining.length} more)`;
    nodeItems.push({ id: virtualId, label, color: '#eeeeee', proxy: true, remaining, targetId: centerId });
    edgeItems.push({ from: virtualId, to: centerId, arrows: 'to', label: '' });

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

  if (network) {
    network.setData({ nodes: visNodes, edges: visEdges });
  } else {
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
        showSubgraph(nodeId);
      }
    });
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

  const newLabel = node.label.replace(/\n\(click to expand.*\)?$/, '');
  const updatedLabel = node.remaining.length > 0 ? `${newLabel}\n(click to expand ${node.remaining.length} more)` : newLabel;

  network.body.data.nodes.update({ id, remaining: node.remaining, label: updatedLabel });
  network.body.data.nodes.add(newNodes);
  network.body.data.edges.add(newEdges);
}
