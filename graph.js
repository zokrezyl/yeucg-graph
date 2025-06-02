
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
  const clusteredNodeIds = new Set();

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
  const clusterGroupsOutgoing = {};  // kind -> [node ids]
  const clusterGroupsIncoming = {};  // kind -> [node ids]
  const outgoingFieldRefs = [];      // [ { field, refId } ]
  const fieldNodes = new Set();

  for (const [key, val] of Object.entries(obj)) {
    if (Array.isArray(val)) {
      const arrayNodeId = `${centerId}::array::${key}`;
      nodeItems.push({ id: arrayNodeId, label: `Array: ${key}`, color: '#eeeeee' });
      edgeItems.push({ from: centerId, to: arrayNodeId, arrows: 'to' });

      for (const item of val) {
        if (item && typeof item === 'object' && '__ref' in item) {
          const refId = item.__ref;
          if (!(refId in fullData)) continue;
          const kind = fullData[refId].kind || 'Other';
          if (!clusterGroupsOutgoing[key]) clusterGroupsOutgoing[key] = {};
          if (!clusterGroupsOutgoing[key][kind]) clusterGroupsOutgoing[key][kind] = [];
          clusterGroupsOutgoing[key][kind].push(refId);
        }
      }
    } else if (val && typeof val === 'object' && '__ref' in val) {
      const fieldNodeId = `${centerId}::field::${key}`;
      fieldNodes.add(fieldNodeId);
      nodeItems.push({ id: fieldNodeId, label: `Field: ${key}`, color: '#dddddd' });
      edgeItems.push({ from: centerId, to: fieldNodeId, arrows: 'to' });
      const refId = val.__ref;
      if (refId in fullData) {
        addNode(refId);
        addEdge(fieldNodeId, refId);
      }
    }
  }

  const totalOutgoingRefs = outgoingFieldRefs.length;

  for (const [field, kinds] of Object.entries(clusterGroupsOutgoing)) {
    let total = 0;
    for (const list of Object.values(kinds)) total += list.length;

    const arrayNodeId = `${centerId}::array::${field}`;
    if (total > CLUSTER_THRESHOLD) {
      for (const [kind, members] of Object.entries(kinds)) {
        const ids = new Set(members);
        const clusterOptions = {
          joinCondition: function (nodeOptions) {
            return ids.has(nodeOptions.id);
          },
          clusterNodeProperties: {
            id: `cluster-${centerId}-${field}-${kind}`,
            label: `Cluster: ${field}/${kind}`,
            allowSingleNodeCluster: false,
            color: '#ccccff'
          }
        };
        network.cluster(clusterOptions);
      }
    } else {
      for (const members of Object.values(kinds)) {
        for (const refId of members) {
          addNode(refId);
          addEdge(arrayNodeId, refId);
        }
      }
    }
  }

  const incoming = fullData[centerId].__meta.incoming || new Set();
  const incomingGroups = {};

  for (const fromId of incoming) {
    if (!(fromId in fullData)) continue;
    const fromObj = fullData[fromId];
    const kind = fromObj.kind || 'Other';
    if (!incomingGroups[kind]) incomingGroups[kind] = [];
    incomingGroups[kind].push(fromId);
  }

  const totalIncoming = incoming.size;
  if (totalIncoming > CLUSTER_THRESHOLD) {
    for (const [kind, members] of Object.entries(incomingGroups)) {
      const ids = new Set(members);
      const clusterOptions = {
        joinCondition: function (nodeOptions) {
          return ids.has(nodeOptions.id);
        },
        clusterNodeProperties: {
          id: `cluster-${centerId}-incoming-${kind}`,
          label: `Incoming: ${kind}`,
          allowSingleNodeCluster: false,
          color: '#ccffcc'
        }
      };
      network.cluster(clusterOptions);
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
