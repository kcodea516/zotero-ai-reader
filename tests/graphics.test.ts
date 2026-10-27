import test from 'node:test';
import assert from 'node:assert/strict';
import { isSVG, MAX_SVG_LENGTH } from '../src/media.ts';

test('preview candidates require a complete standalone SVG within the size limit', () => {
  for (const source of ['<svg xmlns="http://www.w3.org/2000/svg"><text>你好</text></svg>', '<?xml version="1.0"?>\n<svg></svg>']) assert.equal(isSVG(source), true);
  for (const source of ['<svg><rect', '<script>alert(1)</script>', 'Text <svg></svg>', '<svg></svg> trailing text', '<svg>' + ' '.repeat(MAX_SVG_LENGTH) + '</svg>']) assert.equal(isSVG(source), false);
});
