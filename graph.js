
const dataUrl = './clang.json';
let fullData = {};
let nodes = new vis.DataSet();
let edges = new vis.DataSet();

const container = document.getElementById('network');
const network = new vis.Network(container, { nodes, edges }, {
  layout: { improvedLayout: true },
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
  nodes.clear();
  edges.clear();

  const addedNodes = new Set();
  const addedEdges = new Set();

  function addNode(id) {
    if (addedNodes.has(id)) return;
    addedNodes.add(id);
    const obj = fullData[id];
    const type = obj?.__meta?.type || '?';
    nodes.add({ id, label: makeLabel(id, obj), color: getTypeColor(type) });
  }

  function addEdge(from, to) {
    const key = `${from}->${to}`;
    if (addedEdges.has(key)) return;
    addedEdges.add(key);
    edges.add({ from, to, arrows: 'to' });
  }

  if (!(centerId in fullData)) {
    console.warn('Missing centerId:', centerId);
    return;
  }

  const obj = fullData[centerId];
  addNode(centerId);

  console.log('Processing node: refs', centerId);
  for (const val of Object.values(obj)) {
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && '__ref' in item) {
          const refId = item.__ref;
          if (refId in fullData) {
            addNode(refId);
            addEdge(centerId, refId);
          }
        }
      }
    } else if (val && typeof val === 'object' && '__ref' in val) {
      const refId = val.__ref;
      if (refId in fullData) {
        addNode(refId);
        addEdge(centerId, refId);
      }
    }
  }

  console.log('Done: Processing node: refs', centerId);
  const incoming = fullData[centerId].__meta.incoming || new Set();
  for (const fromId of incoming) {
    if (!(fromId in fullData)) continue;
    addNode(fromId);
    addEdge(fromId, centerId);
  }

  console.log('Done Processing node:', centerId);
  network.setData({ nodes: new vis.DataSet([...nodes]), edges: new vis.DataSet([...edges]) });
  network.fit({ nodes: [centerId], animation: false });
}





network.on('doubleClick', function (params) {
  if (params.nodes.length > 0) {
    const clickedId = params.nodes[0];
    showSubgraph(clickedId);
  }
});
