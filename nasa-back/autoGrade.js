// Auto-grading — SPEC_families.md §6, `auto` mode only. `manual` mode has no
// engine: a human grades it via POST /api/turns/:id/grade (see index.js).
//
// Pure function: given a reply and an expectation, decides how many of the
// expected items are present. Deliberately simple — `contains` is a
// case-insensitive substring check, `regex` treats each expected item as its
// own pattern — matching SPEC's own framing: most Orbit prompts have a
// single checkable answer, so getting fancier here buys nothing yet.
//
// Known limitation: this can only confirm expected items are present, never
// detect a hallucinated EXTRA item that isn't one of them (that needs
// structured parsing of the reply, out of scope). So found_count always
// equals matched_count for an auto grade — noise is always 0. Not a bug:
// it's the same "collapses to 0 or 1" simplicity SPEC §6 already accepts for
// accuracy on single-item prompts.
function itemMatches(text, item, mode) {
  const needle = String(item ?? '')
  if (mode === 'regex') {
    try {
      return new RegExp(needle, 'i').test(text)
    } catch {
      return false
    }
  }
  return text.toLowerCase().includes(needle.toLowerCase())
}

// expectation: { expected_items, match } — match is 'contains' | 'regex'.
// Returns null (not gradable this way) for 'manual' or a missing/empty
// expected_items list, so the caller never appends a meaningless grade line.
export function autoGrade(replyText, expectation) {
  const items = expectation?.expected_items
  const mode = expectation?.match
  if (mode === 'manual' || !Array.isArray(items) || items.length === 0) return null

  const text = String(replyText ?? '')
  const matchedCount = items.filter((item) => itemMatches(text, item, mode)).length

  return {
    expected_count: items.length,
    matched_count: matchedCount,
    found_count: matchedCount,
    mode: 'auto',
    graded_by: `auto:${mode}`,
  }
}
