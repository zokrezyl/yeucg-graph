
// menu.js
// -----------------------------------------------------------------------------
// Creates a fixed column containing two buttons in the top-right corner:
//   1. "Fields" (toggles the #field-controls panel)
//   2. "Delete" (deletes all orphan nodes from the network)
//
// Expects a global `network` and an element with id="field-controls" in the DOM.

(function() {
  // 1) Create or select the container for the menu
  var container = document.getElementById('menu-column');
  if (!container) {
    container = document.createElement('div');
    container.id = 'menu-column';
    Object.assign(container.style, {
      position: 'fixed',
      top: '8px',
      right: '8px',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    });
    document.body.appendChild(container);
  }

  // 2) Create the "Fields" button
  var fieldsBtn = document.getElementById('fields-btn');
  if (!fieldsBtn) {
    fieldsBtn = document.createElement('button');
    fieldsBtn.id = 'fields-btn';
    fieldsBtn.textContent = 'Fields';
    Object.assign(fieldsBtn.style, {
      padding: '4px 8px',
      fontSize: '0.9em',
      cursor: 'pointer'
    });
    container.appendChild(fieldsBtn);
  }

  // 3) Create the "Delete" button
  var deleteBtn = document.getElementById('delete-btn');
  if (!deleteBtn) {
    deleteBtn = document.createElement('button');
    deleteBtn.id = 'delete-btn';
    deleteBtn.textContent = 'Delete';
    Object.assign(deleteBtn.style, {
      padding: '4px 8px',
      fontSize: '0.9em',
      cursor: 'pointer'
    });
    container.appendChild(deleteBtn);
  }

  // 4) Wire up the "Fields" button to toggle the panel
  fieldsBtn.onclick = function() {
    var panel = document.getElementById('field-controls');
    if (!panel) return;
    panel.style.display = (panel.style.display === 'none') ? 'flex' : 'none';
  };

  // 5) Wire up the "Delete" button to remove orphan nodes
  deleteBtn.onclick = function() {
    if (!network) return;
    var edges = network.body.data.edges.get();
    var connected = new Set();
    edges.forEach(function(e) {
      connected.add(e.from);
      connected.add(e.to);
    });
    var allNodes = network.body.data.nodes.get();
    var orphanIds = allNodes
      .map(function(n) { return n.id; })
      .filter(function(id) { return !connected.has(id); });
    if (orphanIds.length > 0) {
      network.body.data.nodes.remove(orphanIds);
    }
  };

  // 6) Initially hide the field-controls panel
  var panel = document.getElementById('field-controls');
  if (panel) panel.style.display = 'none';
})();
