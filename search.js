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

    const matches = fuseIndex.search(query).slice(0, 100);
    for (const match of matches) {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.gap = '0.5em';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          showSubgraph(match.item.id, false); // Add to existing network
        }
      });

      const label = document.createElement('span');
      label.textContent = match.item.label;
      label.style.cursor = 'pointer';
      label.addEventListener('click', () => {
        showSubgraph(match.item.id, false); // Also add on label click
      });

      li.appendChild(checkbox);
      li.appendChild(label);
      results.appendChild(li);
    }
  });
}

