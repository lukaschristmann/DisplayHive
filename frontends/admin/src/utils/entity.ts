/**
 * Flatten a server record that may arrive in either of two shapes:
 *
 *   - JSON:API-style: `{ id, attributes: { ...fields } }`
 *   - flat:           `{ id, ...fields }`
 *
 * Returns a single flat object (`{ ...fields, id }`) so callers can read fields
 * with one mapping instead of branching on the wire shape. Different socket
 * emitters in this app use different shapes; this keeps each store's normalizer
 * tolerant of both without repeating the branch in every store.
 */
export function unwrapEntity<T extends Record<string, unknown>>(
  item: ({ id?: string | number; attributes?: T } & Partial<T>) | T,
): T & { id?: string | number } {
  if (
    item &&
    typeof item === 'object' &&
    'attributes' in item &&
    (item as { attributes?: T }).attributes
  ) {
    const withAttrs = item as { id?: string | number; attributes: T }
    return { ...withAttrs.attributes, id: withAttrs.id }
  }
  return item as T & { id?: string | number }
}
