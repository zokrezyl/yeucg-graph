let fuseIndex; // Fuse.js index
function buildSearchIndex(data) {
  nameToIdMap.length = 0;
  for (const [id, obj] of Object.entries(data)) {
    const type = obj.__meta?.type || '?';
    const kind = obj.kind?.replace(/^(CursorKind|TypeKind)\./, '') || '';
    const name = obj.name || obj.displayname || obj.spelling || '';
    const suffix = kind ? `${type}, ${kind}` : type;
    const label = name ? `${name} (${suffix})` : `(${id}::${suffix})`;
    nameToIdMap.push({ id, label });
  }

  fuseIndex = new Fuse(nameToIdMap, {
    keys: ['label'],
    threshold: 0.3,
    includeScore: true,
  });

  const box = document.getElementById('search-box');
  const results = document.getElementById('search-results');

  box.addEventListener('input', () => {
    const query = box.value.trim();
    results.innerHTML = '';
    if (!query || !fuseIndex) return;

    const matches = fuseIndex.search(query).slice(0, 10);
    for (const match of matches) {
      const li = document.createElement('li');
      li.textContent = match.item.label;
      li.style.cursor = 'pointer';
      li.addEventListener('click', () => {
        showSubgraph(match.item.id, true);
        results.innerHTML = '';
        box.value = '';
      });
      results.appendChild(li);
    }
  });
}

