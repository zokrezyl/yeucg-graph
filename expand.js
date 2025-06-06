// expand.js
// Proxy-node expansion logic

function expandProxyNode(id) {
  var node = network.body.data.nodes.get(id);
  if (!node || !node.remaining || node.remaining.length === 0) return;

  var newNodes = [];
  var newEdges = [];
  var nextBatch = node.remaining.splice(0, THRESHOLD);

  nextBatch.forEach(function(refId) {
    if (!(refId in fullData)) return;
    var obj = fullData[refId];
    newNodes.push({
      id: refId,
      label: makeLabel(refId, obj),
      color: getTypeColor(obj.__meta && obj.__meta.type)
    });
    newEdges.push({ from: id, to: refId, arrows: 'to' });
  });

  node.label = node.label.replace(/[…]?$|$/, node.remaining.length > 0 ? '…' : '');
  network.body.data.nodes.update(node);
  network.body.data.nodes.add(newNodes);
  network.body.data.edges.add(newEdges);
}
