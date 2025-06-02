
// Entry point: load JSON file and initialize graph
const dataUrl = './clang.json';
let fullData = {}; // Holds the entire JSON content

const container = document.getElementById('network');
let network;
const CLUSTER_THRESHOLD = 1000; // Only cluster if too many outgoing refs

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
  const outgoingRefs = [];
  const clusterGroups = {};
  const arrayVirtualNodes = new Set();

  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      const virtualId = `${centerId}::array::${key}`;
      nodeItems.push({ id: virtualId, label: `[${key}]`, color: '#eeeeee', font: { ital: true } });
      addEdge(centerId, virtualId, key);

      for (const item of val) {
        if (item && typeof item === 'object' && '__ref' in item) {
          const refId = item.__ref;
          outgoingRefs.push({ field: key, refId, via: virtualId });
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

  const totalOut = outgoingRefs.length;
  if (totalOut > CLUSTER_THRESHOLD) {
    for (const { field, refId, via } of outgoingRefs) {
      if (!(refId in fullData)) continue;
      const refObj = fullData[refId];
      const kind = refObj.kind || 'Other';
      if (!clusterGroups[kind]) clusterGroups[kind] = [];
      clusterGroups[kind].push({ refId, via });
    }

    for (const [kind, entries] of Object.entries(clusterGroups)) {
      if (entries.length <= 1) {
        for (const { refId, via } of entries) {
          addNode(refId);
          addEdge(via, refId);
        }
        continue;
      }

      const members = entries.map(e => e.refId);
      for (const id of members) addNode(id);
      const tempData = new vis.DataSet(nodeItems);
      const tempEdges = new vis.DataSet(edgeItems);
      const tempNetwork = new vis.Network(document.createElement('div'), { nodes: tempData, edges: tempEdges });

      const ids = new Set(members);
      const clusterOptions = {
        joinCondition: nodeOptions => ids.has(nodeOptions.id),
        clusterNodeProperties: {
          id: `cluster-${centerId}-${kind}`,
          label: `Cluster: ${kind}`,
          allowSingleNodeCluster: false,
          color: '#ccccff'
        }
      };

      tempNetwork.cluster(clusterOptions);
      const clusteredNode = tempNetwork.body.data.nodes.get(`cluster-${centerId}-${kind}`);
      nodeItems.push(clusteredNode);
      addEdge(centerId, clusteredNode.id, '');
    }
  } else {
    for (const { refId, via, field } of outgoingRefs) {
      if (!(refId in fullData)) continue;
      addNode(refId);
      addEdge(via, refId, field);
    }
  }

  const incoming = fullData[centerId].__meta.incoming || new Set();
  const incomingRefs = [];

  for (const fromId of incoming) {
    if (!(fromId in fullData)) continue;
    const refObj = fullData[fromId];
    for (const [key, val] of Object.entries(refObj)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && '__ref' in item && item.__ref === centerId) {
            incomingRefs.push({ fromId, field: key });
          }
        }
      } else if (val && typeof val === 'object' && '__ref' in val && val.__ref === centerId) {
        addNode(fromId);
        addEdge(fromId, centerId, key);
      }
    }
  }

  const totalIn = incomingRefs.length;
  if (totalIn > CLUSTER_THRESHOLD) {
    const groups = {};
    for (const { fromId, field } of incomingRefs) {
      const fromObj = fullData[fromId];
      const kind = fromObj.kind || 'Other';
      if (!groups[kind]) groups[kind] = [];
      groups[kind].push(fromId);
    }
    for (const [kind, members] of Object.entries(groups)) {
      for (const id of members) addNode(id);
      const tempData = new vis.DataSet(nodeItems);
      const tempEdges = new vis.DataSet(edgeItems);
      const tempNetwork = new vis.Network(document.createElement('div'), { nodes: tempData, edges: tempEdges });

      const ids = new Set(members);
      const clusterOptions = {
        joinCondition: nodeOptions => ids.has(nodeOptions.id),
        clusterNodeProperties: {
          id: `cluster-in-${centerId}-${kind}`,
          label: `Cluster (in): ${kind}`,
          allowSingleNodeCluster: false,
          color: '#ffeecc'
        }
      };

      tempNetwork.cluster(clusterOptions);
      const clusteredNode = tempNetwork.body.data.nodes.get(`cluster-in-${centerId}-${kind}`);
      nodeItems.push(clusteredNode);
      addEdge(clusteredNode.id, centerId);
    }
  } else {
    for (const { fromId, field } of incomingRefs) {
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

  network.moveTo({ scale: 1.0 });
}
