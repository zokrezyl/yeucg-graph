
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
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && '__ref' in item) {
            const refId = item.__ref;
            if (refId in data) {
              data[refId].__meta.incoming.add(id); // Track who references this object
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

// Create label text for node rendering
function makeLabel(id, obj) {
  const type = obj.__meta?.type || '?';
  return `${id}\n(${type})`;
}

// Assign a color based on node type
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

// Populate and render a subgraph centered around a given node
function showSubgraph(centerId) {
  console.clear();
  console.log('Opening node:', centerId);

  const addedNodes = new Set();
  const addedEdges = new Set();
  const nodeItems = []; // Will batch node creation
  const edgeItems = []; // Will batch edge creation
  const clusteredNodeIds = new Set(); // Tracks nodes to hide in clusters

  // Adds a node to the queue if not already added
  function addNode(id, label, color) {
    if (addedNodes.has(id)) return;
    addedNodes.add(id);
    nodeItems.push({ id, label, color });
  }

  // Adds a directed edge if not already added
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

  const centerObj = fullData[centerId];
  addNode(centerId, makeLabel(centerId, centerObj), getTypeColor(centerObj.__meta?.type || '?'));

  const clusterGroupsOut = {};
  const clusterGroupsIn = {};
  let totalOut = 0;
  let totalIn = centerObj.__meta.incoming?.size || 0;

  for (const [key, val] of Object.entries(centerObj)) {
    if (key === '__meta') continue;

    if (Array.isArray(val)) {
      const virtualId = `${centerId}::field::${key}`;
      addNode(virtualId, `Field: ${key}`, '#eeeeee');
      addEdge(centerId, virtualId);

      const outRefs = [];
      for (const item of val) {
        if (item && typeof item === 'object' && '__ref' in item) {
          outRefs.push(item.__ref);
        }
      }
      totalOut += outRefs.length;

      const kindGroups = {};
      for (const refId of outRefs) {
        if (!(refId in fullData)) continue;
        const kind = fullData[refId].kind || 'Other';
        if (!kindGroups[kind]) kindGroups[kind] = [];
        kindGroups[kind].push(refId);
      }

      if (outRefs.length > CLUSTER_THRESHOLD) {
        for (const [kind, members] of Object.entries(kindGroups)) {
          if (members.length > 1) {
            const ids = new Set(members);
            const clusterOptions = {
              joinCondition: function (nodeOptions) {
                return ids.has(nodeOptions.id);
              },
              clusterNodeProperties: {
                id: `cluster-${virtualId}-${kind}`,
                label: `Cluster: ${key}/${kind}`,
                allowSingleNodeCluster: false,
                color: '#ccccff'
              }
            };
            for (const id of members) {
              addNode(id, makeLabel(id, fullData[id]), getTypeColor(fullData[id].__meta?.type || '?'));
              addEdge(virtualId, id);
            }
            clusteredNodeIds.add({ options: clusterOptions });
          } else {
            for (const id of members) {
              addNode(id, makeLabel(id, fullData[id]), getTypeColor(fullData[id].__meta?.type || '?'));
              addEdge(virtualId, id);
            }
          }
        }
      } else {
        for (const refId of outRefs) {
          if (!(refId in fullData)) continue;
          addNode(refId, makeLabel(refId, fullData[refId]), getTypeColor(fullData[refId].__meta?.type || '?'));
          addEdge(virtualId, refId);
        }
      }
    } else if (val && typeof val === 'object' && '__ref' in val) {
      const refId = val.__ref;
      if (!(refId in fullData)) continue;
      addNode(refId, makeLabel(refId, fullData[refId]), getTypeColor(fullData[refId].__meta?.type || '?'));
      addEdge(centerId, refId);
      totalOut++;
    }
  }

  const incoming = centerObj.__meta.incoming || new Set();
  const incomingKindGroups = {};
  for (const fromId of incoming) {
    if (!(fromId in fullData)) continue;
    const kind = fullData[fromId].kind || 'Other';
    if (!incomingKindGroups[kind]) incomingKindGroups[kind] = [];
    incomingKindGroups[kind].push(fromId);
  }

  if (totalIn > CLUSTER_THRESHOLD) {
    for (const [kind, members] of Object.entries(incomingKindGroups)) {
      if (members.length > 1) {
        const ids = new Set(members);
        const clusterOptions = {
          joinCondition: function (nodeOptions) {
            return ids.has(nodeOptions.id);
          },
          clusterNodeProperties: {
            id: `cluster-in-${centerId}-${kind}`,
            label: `Incoming: ${kind}`,
            allowSingleNodeCluster: false,
            color: '#ffe0e0'
          }
        };
        for (const id of members) {
          addNode(id, makeLabel(id, fullData[id]), getTypeColor(fullData[id].__meta?.type || '?'));
          addEdge(id, centerId);
        }
        clusteredNodeIds.add({ options: clusterOptions });
      } else {
        for (const id of members) {
          addNode(id, makeLabel(id, fullData[id]), getTypeColor(fullData[id].__meta?.type || '?'));
          addEdge(id, centerId);
        }
      }
    }
  } else {
    for (const fromId of incoming) {
      if (!(fromId in fullData)) continue;
      addNode(fromId, makeLabel(fromId, fullData[fromId]), getTypeColor(fullData[fromId].__meta?.type || '?'));
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

  for (const entry of clusteredNodeIds) {
    if (entry.options) {
      network.cluster(entry.options);
    }
  }

  network.moveTo({ scale: 1.0 });
}
