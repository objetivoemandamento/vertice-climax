export function preserveServerManagedFields(candidate, previous, fields) {
  const result = { ...candidate };
  for (const field of fields) {
    if (previous && Object.prototype.hasOwnProperty.call(previous, field)) result[field] = previous[field];
    else delete result[field];
  }
  return result;
}
