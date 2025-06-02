function shouldExpandField(type, field) {
  return !fieldVisibility[type] || fieldVisibility[type][field];
}

function buildFieldPanel(data) {
  const panel = document.getElementById('field-controls');
  if (!panel) return;

  const typeFields = {};

  for (const obj of Object.values(data)) {
    const type = obj.__meta?.type;
    if (!type) continue;
    if (!typeFields[type]) typeFields[type] = new Set();

    for (const key of Object.keys(obj)) {
      if (key === '__meta') continue;
      const val = obj[key];
      if ((Array.isArray(val) && val.some(x => typeof x === 'object' && x?.__ref)) ||
          (val && typeof val === 'object' && '__ref' in val)) {
        typeFields[type].add(key);
      }
    }
  }

  for (const [type, fields] of Object.entries(typeFields)) {
    fieldVisibility[type] = {};
    const box = document.createElement('div');
    box.style.marginBottom = '0.5em';
    const title = document.createElement('div');
    title.textContent = type;
    title.style.fontWeight = 'bold';
    box.appendChild(title);

    for (const field of Array.from(fields).sort()) {
      fieldVisibility[type][field] = true;
      const label = document.createElement('label');
      label.style.marginRight = '1em';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      input.onchange = () => {
        fieldVisibility[type][field] = input.checked;
        updateEdgesByField(type, field, input.checked);
      };
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + field));
      box.appendChild(label);
    }

    panel.appendChild(box);
  }
}

function updateEdgesByField(type, field, visible) {
  const allEdges = network.body.data.edges.get();
  for (const edge of allEdges) {
    const fromNode = network.body.data.nodes.get(edge.from);
    const toNode = network.body.data.nodes.get(edge.to);
    const fromId = fromNode?.sourceId || fromNode?.id;
    const fieldMatch = edge.label === field && fullData[fromId]?.__meta?.type === type;
    if (fieldMatch) {
      if (visible) {
        network.body.data.edges.add(edge);
      } else {
        network.body.data.edges.remove(edge.id);
      }
    }
  }
}
