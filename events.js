
// events.js
// -----------------------------------------------------------------------------
// Restores click‐to‐show tooltip (with a “Delete” button) and double‐click/​context‐menu behavior.

/* global network, fullData, makeLabel, expandProxyNode, showSubgraph */

var tooltipDiv = null;

function ensureTooltipDiv() {
  if (tooltipDiv) return;
  tooltipDiv = document.createElement('div');
  tooltipDiv.id = 'vis-tooltip';
  Object.assign(tooltipDiv.style, {
    position: 'fixed',
    zIndex: 1001,
    maxWidth: '300px',
    whiteSpace: 'pre', 
    background: 'rgba(255,255,255,0.9)',
    border: '1px solid #999',
    borderRadius: '4px',
    padding: '4px 6px',
    fontSize: '0.75em',
    fontFamily: 'monospace',
    pointerEvents: 'auto', // allow clicking Delete
    display: 'none'
  });
  document.body.appendChild(tooltipDiv);
}

function hideTooltip() {
  if (tooltipDiv) tooltipDiv.style.display = 'none';
}

function bindNetworkEvents(net) {
  ensureTooltipDiv();

  var clickTimeout = null;
  var CLICK_DELAY = 200;

  net.on('click', function(params) {
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }
    clickTimeout = setTimeout(function() {
      clickTimeout = null;
      // If click on empty space, hide tooltip
      if (!params.nodes || params.nodes.length === 0) {
        hideTooltip();
        return;
      }
      // Click on a node: show tooltip with Delete button + label
      var nodeId = params.nodes[0];
      var node = net.body.data.nodes.get(nodeId);
      if (!node) return;

      var realId = node.proxy ? node.sourceId || node.targetId : nodeId;
      var obj = fullData[realId] || {};
      var labelText = makeLabel(nodeId, obj, true, !!node.proxy);

      tooltipDiv.innerHTML = ''
        + '<div style="position:relative; font-family:monospace; font-size:0.75em; white-space:pre;">'
        +   '<button id="btn-delete-node" style="display:block; margin-bottom:4px; padding:2px 6px; font-size:0.75em; cursor:pointer;">Delete</button>'
        +   '<div>' + labelText.replace(/</g, '&lt;').replace(/\\n/g, '<br>') + '</div>'
        + '</div>';
      tooltipDiv.dataset.nodeId = nodeId;

      document.getElementById('btn-delete-node').onclick = function() {
        var idToDel = tooltipDiv.dataset.nodeId;
        if (!idToDel) return;
        net.body.data.nodes.remove(idToDel);
        var edgesToRemove = net.body.data.edges
          .get()
          .filter(function(e) { return e.from === idToDel || e.to === idToDel; })
          .map(function(e) { return e.id; });
        net.body.data.edges.remove(edgesToRemove);
        hideTooltip();
      };

      var evt = params.event && params.event.srcEvent;
      if (evt) {
        var x = evt.pageX + 8;
        var y = evt.pageY - 12;
        tooltipDiv.style.left = x + 'px';
        tooltipDiv.style.top  = (y < 0 ? 4 : y) + 'px';
      }
      tooltipDiv.style.display = 'block';
    }, CLICK_DELAY);
  });

  net.on('doubleClick', function(params) {
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }
    hideTooltip();
    if (!params.nodes || params.nodes.length === 0) return;
    var nodeId = params.nodes[0];
    var node = net.body.data.nodes.get(nodeId);
    if (!node) return;
    if (node.proxy) {
      expandProxyNode(nodeId);
    } else {
      showSubgraph(nodeId, false);
    }
  });

  net.on('oncontext', function(params) {
    var pointer = net.getNodeAt(params.pointer.DOM);
    if (!pointer) return;
    params.event.preventDefault();
    net.body.data.nodes.remove(pointer);
    var toRemove = net.body.data.edges
      .get()
      .filter(function(e) { return e.from === pointer || e.to === pointer; })
      .map(function(e) { return e.id; });
    net.body.data.edges.remove(toRemove);
    hideTooltip();
  });
}
