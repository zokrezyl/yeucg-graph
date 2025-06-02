
const dataUrl = './clang.json';
let fullData = {};

const container = document.getElementById('network');
let network;
const CLUSTER_THRESHOLD = 1000;

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
  const clusterGroups = {};

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

  function addEdge(from, to) {
    const key = `${from}->${to}`;
    if (addedEdges.has(key)) return;
    addedEdges.add(key);
    edgeItems.push({ from, to, arrows: 'to' });
  }

  if (!(centerId in fullData)) {
    console.warn('Missing centerId:', centerId);
    return;
  }

  addNode(centerId);
  const obj = fullData[centerId];

  const outgoingRefs = [];
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && '__ref' in item) {
          outgoingRefs.push(item.__ref);
        }
      }
    } else if (val && typeof val === 'object' && '__ref' in val) {
      outgoingRefs.push(val.__ref);
    }
  }

  for (const refId of outgoingRefs) {
    if (!(refId in fullData)) continue;
    const refObj = fullData[refId];
    const kind = refObj.kind || 'Other';
    if (!clusterGroups[kind]) {
      clusterGroups[kind] = [];
    }
    clusterGroups[kind].push(refId);
  }

  const totalOut = outgoingRefs.length;

  for (const [kind, members] of Object.entries(clusterGroups)) {
    for (const id of members) {
      addNode(id);
      addEdge(centerId, id);
    }
  }

  const incoming = fullData[centerId].__meta.incoming || new Set();
  for (const fromId of incoming) {
    if (!(fromId in fullData)) continue;
    addNode(fromId);
    addEdge(fromId, centerId);
  }

  const visNodes = new vis.DataSet(nodeItems);
  const visEdges = new vis.DataSet(edgeItems);

  if (network) {
    network.setData({ nodes: visNodes, edges: visEdges });
  } else {
    network = new vis.Network(container, { nodes: visNodes, edges: visEdges }, {
      layout: { improvedLayout: false },
      interaction: { hover: true },
      physics: { stabilization: true },
    });

    network.on('doubleClick', function (params) {
      if (params.nodes.length > 0) {
        const clickedId = params.nodes[0];
        if (network.isCluster(clickedId)) {
          network.openCluster(clickedId);
        } else {
          showSubgraph(clickedId);
        }
      }
    });
  }

  // Apply clustering after nodes are added
  if (totalOut > CLUSTER_THRESHOLD) {
    for (const [kind, members] of Object.entries(clusterGroups)) {
      if (members.length > 1) {
        const ids = new Set(members);
        const clusterOptions = {
          joinCondition: function (nodeOptions) {
            return ids.has(nodeOptions.id);
          },
          clusterNodeProperties: {
            id: `cluster-${centerId}-${kind}`,
            label: `Cluster: ${kind}`,
            allowSingleNodeCluster: false,
            color: '#ccccff'
          }
        };
        network.cluster(clusterOptions);
      }
    }
  }

  network.moveTo({ scale: 1.0 });
}
