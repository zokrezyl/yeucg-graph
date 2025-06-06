// utils.js
// Label creation, color palette, and field visibility helper

function makeLabel(id, obj, isExpanded, isProxy) {
  isExpanded = !!isExpanded;
  isProxy = !!isProxy;
  var type = (obj.__meta && obj.__meta.type) || '?';
  var kind = obj.kind || '';
  var kindShort = kind.replace(/^(CursorKind|TypeKind)\./, '');
  var name = obj.name || obj.displayname || obj.spelling || '';
  var line1 = name ? name : '';
  var line2 = '(' + id + '::' + type + (kindShort ? '/' + kindShort : '') + ')';
  var header = line1 ? line1 + '\n' + line2 : line2;
  if (!isExpanded) return header;

  var fieldsArr = [];
  for (var key in obj) {
    if (key === '__meta') continue;
    var v = obj[key];
    if (Array.isArray(v)) {
      var isRefArray = v.some(function(x) {
        return x && typeof x === 'object' && '__ref' in x;
      });
      fieldsArr.push(key + ': ' + (isRefArray ? '[]->' : '[…]'));
    } else if (v && typeof v === 'object' && '__ref' in v) {
      fieldsArr.push(key + ': ->');
    } else {
      fieldsArr.push(key + ': ' + JSON.stringify(v));
    }
  }
  return [header].concat(fieldsArr).join('\n');
}

function getTypeColor(type) {
  var palette = {
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

function shouldExpandField(type, field) {
  return !(fieldVisibility[type]) || fieldVisibility[type][field];
}
