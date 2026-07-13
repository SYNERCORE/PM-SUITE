// ── Files utility ──────────────────────────────────────────────
// Small facade over document file references. Docs no longer hold
// base64 blobs — they carry SP file coords ({spDriveId, spItemId,
// fileUrl, fileWebUrl}) instead. This module keeps the check-and-
// strip logic in one place so future writers can't reintroduce the
// bloated shape.
//
// Public API:
//   Files.strip(doc)            → new doc with base64 fileData removed
//   Files.stripMany(docs)       → array-mapped strip
//   Files.hasAttachment(doc)    → true if any file reference (SP or legacy) present
//   Files.hasBlob(doc)          → true if legacy base64 fileData is still on the record

const Files = (function () {
  function hasBlob(doc) {
    return !!(doc && typeof doc.fileData === 'string' && doc.fileData.length > 0);
  }

  function hasAttachment(doc) {
    if (!doc) return false;
    return !!(doc.fileData || doc.fileUrl || doc.fileWebUrl || (doc.spDriveId && doc.spItemId));
  }

  function strip(doc) {
    if (!doc || !hasBlob(doc)) return doc;
    const copy = { ...doc };
    delete copy.fileData;
    return copy;
  }

  function stripMany(docs) {
    if (!Array.isArray(docs)) return docs;
    return docs.map(strip);
  }

  return { strip, stripMany, hasAttachment, hasBlob };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Files;
