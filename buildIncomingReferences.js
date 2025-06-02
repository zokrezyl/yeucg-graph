function buildIncomingReferences(data) {
  for (const obj of Object.values(data)) {
    if (!obj.__meta) obj.__meta = {};
    obj.__meta.incoming = [];
  }

  for (const [id, obj] of Object.entries(data)) {
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && '__ref' in item) {
            const refId = item.__ref;
            if (refId in data) {
              data[refId].__meta.incoming.push({ id, field: key });
            }
          }
        }
      } else if (val && typeof val === 'object' && '__ref' in val) {
        const refId = val.__ref;
        if (refId in data) {
          data[refId].__meta.incoming.push({ id, field: key });
        }
      }
    }
  }
}
