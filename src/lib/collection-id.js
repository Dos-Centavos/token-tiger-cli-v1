/*
  Infer collection vs sharable public id from string shape (Mongo ObjectId hex vs numeric publicId).
*/

/** 24-char hex — typical MongoDB ObjectId (collection id). */
const RE_OBJECT_ID = /^[a-fA-F0-9]{24}$/

/** Decimal string — sharable collection publicId in token-tiger-v1. */
const RE_SHARABLE_PUBLIC_ID = /^[0-9]+$/

/**
 * @returns {{ kind: 'collection', id: string } | { kind: 'sharable', id: string }}
 */
export function classifyCollectionTokenId (raw) {
  const s = raw == null ? '' : String(raw).trim()
  if (s === '') {
    throw new Error('Collection identifier is missing.')
  }
  if (RE_OBJECT_ID.test(s)) {
    return { kind: 'collection', id: s.toLowerCase() }
  }
  if (RE_SHARABLE_PUBLIC_ID.test(s)) {
    return { kind: 'sharable', id: s }
  }
  throw new Error(
    'Unrecognized id: use a 24-character hex collection id, or a numeric sharable public id.'
  )
}
