import test from 'node:test';
import assert from 'node:assert/strict';
import { locateText, pageText, parseSuggestions, isAnnotationPlan, type PDFPageData } from '../src/annotations.ts';

export function page(text: string): PDFPageData {
  let x = 20, y = 700;
  const chars: PDFPageData['chars'] = [];
  for (const u of text) {
    if (u === '\n') { if (chars.length) chars[chars.length - 1].lineBreakAfter = true; x = 20; y -= 15; continue; }
    chars.push({ u, rect: [x, y, x + 5, y + 10] }); x += 5;
  }
  return { chars, viewBox: [0, 0, 600, 800] };
}
const quote = 'The decoder and encoder share GPU resources.';
const proposal = (extra = {}) => ({ page: 1, quote, comment: 'Explain the shared resources.', type: 'highlight', color: '#ffd400', ...extra });
test('PDF text matching tolerates whitespace ligatures and line hyphenation while using real positions', () => {
  const data = page('Intro. The de-\ncoder and encoder share GPU resources. End.');
  const result = locateText(data, 3, quote);
  assert.equal(typeof result, 'object');
  if (typeof result !== 'object') return;
  assert.equal(result.position.pageIndex, 2);
  assert.ok(result.position.rects.length >= 2);
  assert.ok(result.sortIndex.startsWith('00002|'));
  assert.ok(pageText(page('An eﬃcient mechanism for resource sharing.').chars).includes('ﬃ'));
  assert.equal(typeof locateText(page('An eﬃcient mechanism for resource sharing.'), 1, 'An efficient mechanism for resource sharing.'), 'object');
});
test('repeated, missing, too-short and invalid-geometry passages cannot be annotated', () => {
  assert.equal(locateText(page(`${quote}\n${quote}`), 1, quote), 'ambiguous');
  assert.equal(locateText(page(quote), 1, 'An invented statement about optimization.'), 'missing');
  assert.equal(locateText(page(quote), 1, 'The decoder'), 'missing');
  const data = page(quote); data.chars[2].rect = [NaN, 2, 4, 8];
  assert.equal(locateText(data, 1, quote), 'missing');
});
test('structured plans drop model coordinates and keys and deduplicate identical suggestions', () => {
  const value = parseSuggestions(JSON.stringify({ summary: 'Draft only.', annotations: [proposal({ position: { rects: [[0, 0, 9999, 9999]] }, attachmentKey: 'OTHERPDF' }), proposal()] }), [1]);
  assert.equal(value.items.length, 1);
  assert.equal('position' in value.items[0], false);
  assert.equal('attachmentKey' in value.items[0], false);
  assert.equal(value.items[0].comment, 'Explain the shared resources.');
});
test('malformed actions, unsupported types/colors, oversized comments and unsupplied pages fail closed', () => {
  for (const annotations of [[proposal({ page: 2 })], [proposal({ type: 'delete' })], [proposal({ color: 'url(example)' })], [proposal({ comment: 'a'.repeat(2401) })], Array.from({ length: 9 }, () => proposal())]) {
    assert.throws(() => parseSuggestions(JSON.stringify({ summary: '', annotations }), [1]));
  }
  assert.throws(() => parseSuggestions('Run this code instead', [1]));
  assert.deepEqual(parseSuggestions('{"summary":"Insufficient evidence","annotations":[]}', [1]).items, []);
  assert.equal(isAnnotationPlan({ id: 'delete-all', items: [] }), false);
});

test('malformed persisted candidate entries are rejected without throwing away valid chat history', () => {
  const base = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', scope: { libraryID: 1, itemKey: 'PAPER001', title: 'Paper' }, attachmentKey: 'PDF00001', fingerprint: '1:2', totalPages: 1, receipts: [] };
  for (const items of [[null], [undefined], ['string'], [42]]) assert.equal(isAnnotationPlan({ ...base, items }), false);
});
