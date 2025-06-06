// events.js
// Click, double-click, and context-menu event bindings

function bindNetworkEvents(net) {
  var clickTimeout = null;
  var CLICK_DELAY = 200;

  net.on('click', function(params) {
    if (clickTimeout) {
      clearTimeout(clickTimeout);
      clickTimeout = null;
    }
    clickTimeout = setTimeout(function() {
      clickTimeout = null;
      if (!params.nodes || params.nodes.length === 0) {
        hideTooltip();
        return;
      }
      var nodeId = params.nodes[0];
      var node = net.body.data.nodes.get(nodeId);
      if (!node) return;
      var realId = node.proxy ? node.sourceId || node.targetId : nodeId;
      var obj = fullData[realId] || {};
      var label = makeLabel(nodeId, obj, true, !!node.proxy);
      var evt = params.event && params.event.srcEvent;
      if (evt) {
        showTooltip(label, evt.pageX, evt.pageY);
      }
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
  });
}
