
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
  const clusterGroups = {}; // Will store grouping by 'kind'
  const clusteredNodeIds = new Set(); // Tracks nodes to hide in clusters

  // Adds a node to the queue if not already added
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

  addNode(centerId); // Always include the center
  const obj = fullData[centerId];

  const outgoingRefs = []; // Store all outgoing __ref values

  // Walk the fields to collect references
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

  // Group referenced nodes by their 'kind'
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

  // For large numbers of refs, apply clustering
  for (const [kind, members] of Object.entries(clusterGroups)) {
    if (totalOut > CLUSTER_THRESHOLD && members.length > 1) {
      for (const id of members) {
        clusteredNodeIds.add(id); // Mark for later clustering
      }
    } else {
      for (const id of members) {
        addNode(id);
        addEdge(centerId, id);
      }
    }
  }

  // Add incoming nodes and edges normally
  const incoming = fullData[centerId].__meta.incoming || new Set();
  for (const fromId of incoming) {
    if (!(fromId in fullData)) continue;
    addNode(fromId);
    addEdge(fromId, centerId);
  }

  const visNodes = new vis.DataSet(nodeItems); // Batch nodes
  const visEdges = new vis.DataSet(edgeItems); // Batch edges

  // Initial creation or data replacement
  if (network) {
    network.setData({ nodes: visNodes, edges: visEdges });
  } else {
    network = new vis.Network(container, { nodes: visNodes, edges: visEdges }, {
      layout: { improvedLayout: false },
      interaction: { hover: true },
      physics: { stabilization: true },
    });

    // Handle double-click: expand clusters or drill down
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

  // Add clusters for large outgoing groups
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
        network.cluster(clusterOptions); // Collapse group
      }
    }
  }

  // Center viewport
  network.moveTo({ scale: 1.0 });
}
