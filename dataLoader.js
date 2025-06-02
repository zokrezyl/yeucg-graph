fetch(dataUrl)
  .then(res => res.json())
  .then(json => {
    fullData = json;
    buildIncomingReferences(json);
    buildSearchIndex(json);
    buildFieldPanel(json); // ← New
    const rootId = Object.keys(json)[0];
    showSubgraph(rootId, true);
  });
