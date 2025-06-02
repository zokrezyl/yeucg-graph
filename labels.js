function makeLabel(id, obj, isExpanded = false, isProxy = false) {
  const type = obj.__meta?.type || '?';
  const kind = obj.kind || '';
  const kindShort = kind.replace(/^(CursorKind|TypeKind)\./, '');
  const name = obj.name || obj.displayname || obj.spelling || '';
  const line1 = name ? name : '';
  const line2 = `(${id}::${type}${kindShort ? '/' + kindShort : ''})`;
  const header = line1 ? `${line1}\n${line2}` : line2;
  if (!isExpanded) return header;

  const fields = Object.entries(obj)
    .filter(([k]) => k !== '__meta')
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        const isRefArray = v.some(x => typeof x === 'object' && x.__ref);
        return `${k}: ${isRefArray ? '[]->' : '[…]'}`;
      } else if (v && typeof v === 'object' && '__ref' in v) {
        return `${k}: ->`;
      } else {
        return `${k}: ${JSON.stringify(v)}`;
      }
    });

  return [header, ...fields].join('\n');
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
