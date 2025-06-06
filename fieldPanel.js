
// fieldPanel.js
// -----------------------------------------------------------------------------
// Public functions:
//   • shouldExpandField(type, field)
//   • updateEdgesByField(type, field, visible)
//   • buildFieldPanel(data)
//
// The #field-controls element is initially hidden. Calling buildFieldPanel(data)
// populates it but does not show it on its own.

window.fieldVisibility = window.fieldVisibility || {};

function shouldExpandField(type, field) {
  return !window.fieldVisibility[type] || window.fieldVisibility[type][field];
}

function updateEdgesByField(type, field, visible) {
  var allEdges = network.body.data.edges.get();
  allEdges.forEach(function(edge) {
    var fromNode = network.body.data.nodes.get(edge.from);
    var fromId = fromNode && (fromNode.sourceId || fromNode.id);
    if (
      edge.label === field &&
      window.fieldVisibility[type] &&
      fullData[fromId] &&
      fullData[fromId].__meta &&
      fullData[fromId].__meta.type === type
    ) {
      if (visible) {
        network.body.data.edges.add(edge);
      } else {
        network.body.data.edges.remove(edge.id);
      }
    }
  });
}

function buildFieldPanel(data) {
  var panel = document.getElementById('field-controls');
  if (!panel) return;

  // Hide panel initially
  panel.style.display = 'none';

  // Clear existing content and set up flex layout
  panel.innerHTML = '';
  panel.style.fontSize   = '0.8em';
  panel.style.display    = 'none'; // remain hidden until toggled
  panel.style.flexWrap   = 'wrap';
  panel.style.alignItems = 'flex-start';
  panel.style.gap        = '0.8rem';

  // Gather fields that contain __ref for each type
  var typeFields = {};
  Object.values(data).forEach(function(obj) {
    var type = obj.__meta && obj.__meta.type;
    if (!type) return;
    if (!typeFields[type]) typeFields[type] = new Set();

    Object.keys(obj).forEach(function(key) {
      if (key === '__meta') return;
      var val = obj[key];
      var hasRef =
        (Array.isArray(val) &&
          val.some(function(item) { return item && typeof item === 'object' && '__ref' in item; })) ||
        (val && typeof val === 'object' && '__ref' in val);
      if (hasRef) typeFields[type].add(key);
    });
  });

  // For each type, create a column with its fields as checkboxes
  Object.entries(typeFields).forEach(function(entry) {
    var type  = entry[0];
    var fields = Array.from(entry[1]).sort();
    window.fieldVisibility[type] = {};

    var column = document.createElement('div');
    column.style.minWidth   = '90px';
    column.style.maxWidth   = '110px';
    column.style.flexShrink = '0';

    var header = document.createElement('div');
    header.textContent      = type;
    header.style.fontWeight = 'bold';
    header.style.marginBottom = '0.3em';
    column.appendChild(header);

    var ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.padding   = '0';
    ul.style.margin    = '0';
    column.appendChild(ul);

    fields.forEach(function(field) {
      window.fieldVisibility[type][field] = true;

      var li = document.createElement('li');
      li.style.marginTop = '0.35em';

      var label = document.createElement('label');
      label.style.cursor = 'pointer';

      var input = document.createElement('input');
      input.type    = 'checkbox';
      input.checked = true;
      input.onchange = function() {
        window.fieldVisibility[type][field] = input.checked;
        updateEdgesByField(type, field, input.checked);
      };

      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + field));
      li.appendChild(label);
      ul.appendChild(li);
    });

    panel.appendChild(column);
  });
}

// Expose globally
window.shouldExpandField = shouldExpandField;
window.updateEdgesByField = updateEdgesByField;
window.buildFieldPanel = buildFieldPanel;
