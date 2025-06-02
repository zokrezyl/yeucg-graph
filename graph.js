
const dataUrl = './clang.json';
let fullData = {};

const container = document.getElementById('network');
const network = new vis.Network(container, { nodes: [], edges: [] }, {
  layout: { improvedLayout: false },
  interaction: { hover: true },
  physics: { stabilization: true },
});

fetch(dataUrl)
  .then(res => res.json())
  .then(json => {
    fullData = json;
    console.log('Loaded nodes:', Object.keys(json).length);
    buildIncomingReferences(json);
    const rootId = Object.keys(json)[0];
    showSubgraph(rootId);
  });

function buildIncomingReferences(data) {
  for (const obj of Object.values(data)) {
    if (!obj.__meta) obj.__meta = {};
    obj.__meta.incoming = new Set();
  }

  let refCount = 0;
  for (const [id, obj] of Object.entries(data)) {
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && '__ref' in item) {
            const refId = item.__ref;
            if (data[refId]) {
              data[refId].__meta.incoming.add(id);
              refCount++;
            }
          }
        }
      } else if (val && typeof val === 'object' && '__ref' in val) {
        const refId = val.__ref;
        if (data[refId]) {
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

  const nodeItems = [];
  const edgeItems = [];
  const addedNodes = new Set();
  const addedEdges = new Set();

  const clusterThreshold = 1000;
  const clusterMap = new Map();
  let forwardRefs = [];

  function addNode(id) {
    if (addedNodes.has(id)) return;
    addedNodes.add(id);
    const obj = fullData[id];
    const type = obj?.__meta?.type || '?';
    nodeItems.push({ id, label: makeLabel(id, obj), color: getTypeColor(type) });
  }

  function addEdge(from, to, label = null) {
    const key = `${from}->${to}`;
    if (addedEdges.has(key)) return;
    addedEdges.add(key);
    edgeItems.push({ from, to, arrows: 'to', label });
  }

  if (!(centerId in fullData)) {
    console.warn('Missing centerId:', centerId);
    return;
  }

  const obj = fullData[centerId];
  addNode(centerId);

  // Collect forward refs
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && '__ref' in item) {
          forwardRefs.push(item.__ref);
        }
      }
    } else if (val && typeof val === 'object' && '__ref' in val) {
      forwardRefs.push(val.__ref);
    }
  }

  if (forwardRefs.length > clusterThreshold) {
    console.log(`Clustering ${forwardRefs.length} forward refs...`);
    for (const refId of forwardRefs) {
      const refObj = fullData[refId];
      const kind = refObj?.kind || 'Other';
      if (!clusterMap.has(kind)) clusterMap.set(kind, new Set());
      clusterMap.get(kind).add(refId);
    }
    for (const [kind, members] of clusterMap.entries()) {
      const clusterId = `${centerId}::cluster::${kind}`;
      if (!addedNodes.has(clusterId)) {
        nodeItems.push({ id: clusterId, label: `(${kind})`, color: '#ccc' });
        addedNodes.add(clusterId);
      }
      addEdge(centerId, clusterId, 'kind');
    }

  console.log(`Clustering done`);
  } else {

    for (const refId of forwardRefs) {
      if (!(refId in fullData)) continue;
      addNode(refId);
      addEdge(centerId, refId);
    }
      // allow incoming edges only when not clustering
    const incoming = fullData[centerId].__meta.incoming || new Set();
    for (const fromId of incoming) {
      if (!(fromId in fullData)) continue;
      addNode(fromId);
      addEdge(fromId, centerId);
    }
  }


  network.setData({
    nodes: new vis.DataSet(nodeItems),
    edges: new vis.DataSet(edgeItems),
  });

  //network.moveTo({ scale: 0.5 });

  network.fit({ nodes: [centerId], animation: false });
}

network.on('doubleClick', function (params) {
  if (params.nodes.length > 0) {
    const clickedId = params.nodes[0];
    showSubgraph(clickedId);
  }
});
