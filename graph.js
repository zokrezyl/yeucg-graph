
// Entry point: load JSON file and initialize graph
const dataUrl = './clang.json';
let fullData = {}; // Holds the entire JSON content

const container = document.getElementById('network');
let network;
const CLUSTER_THRESHOLD = 1000; // Only cluster if too many refs

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
  const clusterGroups = {};
  const incomingClusterGroups = {};

  function addNode(id, label = null, color = '#E0E0E0') {
    if (addedNodes.has(id)) return;
    addedNodes.add(id);
    const obj = fullData[id];
    const nodeLabel = label || (obj ? makeLabel(id, obj) : id);
    const nodeColor = obj ? getTypeColor(obj.__meta?.type || '?') : color;
    nodeItems.push({ id, label: nodeLabel, color: nodeColor });
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
  const fieldGroups = {};

  for (const [fieldName, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      const fieldNodeId = `${centerId}::field::${fieldName}`;
      addNode(fieldNodeId, `[${fieldName}]`, '#ddddff');
      addEdge(centerId, fieldNodeId);
      const refs = [];
      for (const item of val) {
        if (item && typeof item === 'object' && '__ref' in item) {
          refs.push(item.__ref);
        }
      }
      fieldGroups[fieldName] = refs;
      for (const refId of refs) {
        outgoingRefs.push(refId);
      }
    } else if (val && typeof val === 'object' && '__ref' in val) {
      outgoingRefs.push(val.__ref);
    }
  }

  const totalOut = outgoingRefs.length;

  for (const [fieldName, refs] of Object.entries(fieldGroups)) {
    const fieldNodeId = `${centerId}::field::${fieldName}`;
    const kindGroups = {};
    for (const refId of refs) {
      if (!(refId in fullData)) continue;
      const refObj = fullData[refId];
      const kind = refObj.kind || 'Other';
      if (!kindGroups[kind]) kindGroups[kind] = [];
      kindGroups[kind].push(refId);
    }

    for (const [kind, members] of Object.entries(kindGroups)) {
      if (totalOut > CLUSTER_THRESHOLD && members.length > 1) {
        const ids = new Set(members);
        const clusterOptions = {
          joinCondition: function (nodeOptions) {
            return ids.has(nodeOptions.id);
          },
          clusterNodeProperties: {
            id: `cluster-${fieldNodeId}-${kind}`,
            label: `Cluster: ${fieldName}/${kind}`,
            allowSingleNodeCluster: false,
            color: '#ccffcc'
          }
        };
        for (const id of members) addNode(id);
        edgeItems.push(...members.map(id => ({ from: fieldNodeId, to: id, arrows: 'to' })));
        clusterGroups[`cluster-${fieldNodeId}-${kind}`] = clusterOptions;
      } else {
        for (const id of members) {
          addNode(id);
          addEdge(fieldNodeId, id);
        }
      }
    }
  }

  const incoming = obj.__meta.incoming || new Set();
  const incomingList = Array.from(incoming);
  const totalIn = incomingList.length;

  for (const fromId of incomingList) {
    if (!(fromId in fullData)) continue;
    const fromObj = fullData[fromId];
    const kind = fromObj.kind || 'Other';
    if (!incomingClusterGroups[kind]) incomingClusterGroups[kind] = [];
    incomingClusterGroups[kind].push(fromId);
  }

  for (const [kind, members] of Object.entries(incomingClusterGroups)) {
    if (totalIn > CLUSTER_THRESHOLD && members.length > 1) {
      const ids = new Set(members);
      const clusterOptions = {
        joinCondition: function (nodeOptions) {
          return ids.has(nodeOptions.id);
        },
        clusterNodeProperties: {
          id: `cluster-incoming-${centerId}-${kind}`,
          label: `Incoming Cluster: ${kind}`,
          allowSingleNodeCluster: false,
          color: '#ffcccc'
        }
      };
      for (const id of members) addNode(id);
      edgeItems.push(...members.map(fromId => ({ from: fromId, to: centerId, arrows: 'to' })));
      clusterGroups[`cluster-incoming-${centerId}-${kind}`] = clusterOptions;
    } else {
      for (const fromId of members) {
        addNode(fromId);
        addEdge(fromId, centerId);
      }
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

  for (const clusterOptions of Object.values(clusterGroups)) {
    network.cluster(clusterOptions);
  }

  network.moveTo({ scale: 1.0 });
}
