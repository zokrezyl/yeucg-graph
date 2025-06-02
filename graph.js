
// Entry point: load JSON file and initialize graph
const dataUrl = './clang.json';
let fullData = {}; // Holds the entire JSON content

const container = document.getElementById('network');
let network;
const OUTGOING_THRESHOLD = 10; // Only show this many refs per array
const INCOMING_THRESHOLD = 10; // Only show this many incoming refs

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

// For every object, find others referencing it and track them in __meta.incoming
function buildIncomingReferences(data) {
  for (const obj of Object.values(data)) {
    if (!obj.__meta) obj.__meta = {};
    obj.__meta.incoming = new Set();
  }

  let refCount = 0;
  for (const [id, obj] of Object.entries(data)) {
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && '__ref' in item) {
            const refId = item.__ref;
            if (refId in data) {
              data[refId].__meta.incoming.add(id);
              refCount++;
            }
          }
        }
      } else if (val && typeof val === 'object' && '__ref' in val) {
        const refId = val.__ref;
        if (refId in data) {
          data[refId].__meta.incoming.add(id);
          refCount++;
        }
      }
    }
  }
  console.log('Total references indexed:', refCount);
}

function makeLabel(id, obj) {
  const type = obj.__meta?.type || '?';
  return `${id}\n(${type})`;
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
  const virtualFieldNodes = new Set();

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

  if (!(centerId in fullData)) {
    console.warn('Missing centerId:', centerId);
    return;
  }

  addNode(centerId);
  const obj = fullData[centerId];

  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      const virtualId = `${centerId}::field::${key}`;
      nodeItems.push({ id: virtualId, label: `[${key}]`, color: '#eeeeee' });
      edgeItems.push({ from: centerId, to: virtualId, arrows: 'to', label: key });
      virtualFieldNodes.add(virtualId);

      let count = 0;
      for (const item of val) {
        if (item && typeof item === 'object' && '__ref' in item) {
          if (count++ >= OUTGOING_THRESHOLD) break;
          const refId = item.__ref;
          if (!(refId in fullData)) continue;
          addNode(refId);
          addEdge(virtualId, refId);
        }
      }
    } else if (val && typeof val === 'object' && '__ref' in val) {
      const refId = val.__ref;
      if (refId in fullData) {
        addNode(refId);
        addEdge(centerId, refId, key);
      }
    }
  }

  const incoming = fullData[centerId].__meta.incoming || new Set();
  if (incoming.size > INCOMING_THRESHOLD) {
    const virtualIncomingId = `${centerId}::virtual::incoming`;
    nodeItems.push({ id: virtualIncomingId, label: '[incoming]', color: '#dddddd' });
    edgeItems.push({ from: virtualIncomingId, to: centerId, arrows: 'to', label: 'incoming' });
    let count = 0;
    for (const fromId of incoming) {
      if (!(fromId in fullData)) continue;
      if (count++ >= INCOMING_THRESHOLD) break;
      addNode(fromId);
      addEdge(fromId, virtualIncomingId);
    }
  } else {
    for (const fromId of incoming) {
      if (!(fromId in fullData)) continue;
      addNode(fromId);
      addEdge(fromId, centerId);
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
      if (params.nodes.length > 0) {
        const clickedId = params.nodes[0];
        showSubgraph(clickedId);
      }
    });
  }

  network.moveTo({ scale: 1.0 });
}
