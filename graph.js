
const dataUrl = './clang.json';
let fullData = {};
let reverseRefs = {};
let forwardRefs = {};
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
    buildReferenceMaps(json);
    if (Object.keys(json).length > 0) {
      const rootId = Object.keys(json)[0];
      showSubgraph(rootId);
    }
  });

function buildReferenceMaps(data) {
  reverseRefs = {};
  forwardRefs = {};
  for (const [id, obj] of Object.entries(data)) {
    forwardRefs[id] = new Set();
    walkObject(id, obj, (refId) => {
      forwardRefs[id].add(refId);
      if (!(refId in reverseRefs)) reverseRefs[refId] = new Set();
      reverseRefs[refId].add(id);
    });
  }
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
  nodes.clear();
  edges.clear();
  if (!(centerId in fullData)) return;

  const center = fullData[centerId];
  const centerType = center.__meta?.type || '?';
  nodes.add({ id: centerId, label: makeLabel(centerId, center), color: getTypeColor(centerType) });

  if (forwardRefs[centerId]) {
    forwardRefs[centerId].forEach(refId => {
      if (refId in fullData) {
        const ref = fullData[refId];
        const refType = ref.__meta?.type || '?';
        nodes.add({ id: refId, label: makeLabel(refId, ref), color: getTypeColor(refType) });
        edges.add({ from: centerId, to: refId, label: 'refers', arrows: 'to' });
      }
    });
  }

  if (reverseRefs[centerId]) {
    reverseRefs[centerId].forEach(fromId => {
      if (fromId in fullData) {
        const from = fullData[fromId];
        const fromType = from.__meta?.type || '?';
        nodes.add({ id: fromId, label: makeLabel(fromId, from), color: getTypeColor(fromType) });
        edges.add({ from: fromId, to: centerId, label: 'refers', arrows: 'to' });
      }
    });
  }

  network.fit({ nodes: [centerId], animation: true });
}


function walkObject(parentId, obj, onRef, keyPrefix = '') {
  if (Array.isArray(obj)) {
    obj.forEach((entry, idx) => {
      if (entry && typeof entry === 'object') {
        if ('__ref' in entry) {
          onRef(entry.__ref, keyPrefix + `[${idx}]`);
        } else {
          walkObject(parentId, entry, onRef, keyPrefix + `[${idx}]`);
        }
      }
    });
    return;
  }

  if (!obj || typeof obj !== 'object') return;

  for (const [key, val] of Object.entries(obj)) {
    const fullKey = keyPrefix ? `${keyPrefix}.${key}` : key;

    if (Array.isArray(val)) {
      walkObject(parentId, val, onRef, fullKey);
    } else if (val && typeof val === 'object') {
      if ('__ref' in val) {
        onRef(val.__ref, fullKey);
      } else {
        walkObject(parentId, val, onRef, fullKey);
      }
    }
  }
}
network.on('doubleClick', function (params) {
  if (params.nodes.length > 0) {
    const clickedId = params.nodes[0];
    showSubgraph(clickedId);
  }
});
