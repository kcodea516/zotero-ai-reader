import test from 'node:test';
import assert from 'node:assert/strict';
import { getLanguage, tr, localizeError } from '../src/i18n.ts';
import { bilingualError } from '../src/i18n-errors.ts';

test('missing and unsupported language values preserve the existing Chinese default', () => {
  for (const value of [undefined, null, '', 'en', 'fr-FR', {}, ['en-US']]) {
    assert.equal(getLanguage({ language: value }), 'zh-CN');
  }
  assert.equal(getLanguage(), 'zh-CN');
  assert.equal(getLanguage({ language: 'en-US' }), 'en-US');
  assert.equal(tr('en-US', '设置', 'Settings'), 'Settings');
});

test('safe bilingual errors display in the selected language without changing the error', () => {
  const error = bilingualError('请先在设置中添加 API 和模型。', 'Add an API endpoint and model in Settings first.');
  assert.equal(localizeError(error, 'en-US'), error.englishMessage);
  assert.equal(localizeError(error, 'zh-CN'), error.message);
  assert.equal(error.message, '请先在设置中添加 API 和模型。');
});

test('legacy status strings switch both ways without changing embedded paper titles', () => {
  const old = '已读取 2 篇文献的原文片段。 已按需联查 1 篇相关论文。 关联文献“中文原题”没有可提取的正文。';
  const english = localizeError(old, 'en-US');
  assert.ok(english.includes('中文原题'));
  assert.ok(!english.replace('中文原题', '').match(/\p{Script=Han}/u));
  assert.equal(localizeError(english, 'zh-CN'), old);
  assert.equal(localizeError('Read excerpts from 2 papers. Consulted 1 related paper on demand.', 'zh-CN'), '已读取 2 篇文献的原文片段。 已按需联查 1 篇相关论文。');
});

test('persisted API status messages keep status codes in both languages', () => {
  const original = 'API 鉴权失败（401），请检查密钥及调用权限。';
  const english = localizeError(original, 'en-US');
  assert.ok(english.includes('(401)'));
  assert.ok(!/\p{Script=Han}/u.test(english));
  assert.equal(localizeError(english, 'zh-CN'), original);
});

test('unknown strings are preserved rather than guessed or treated as model output', () => {
  const text = 'Unrecognized diagnostic 123: 论文原文';
  assert.equal(localizeError(text, 'en-US'), text);
  assert.equal(localizeError(text, 'zh-CN'), text);
});
