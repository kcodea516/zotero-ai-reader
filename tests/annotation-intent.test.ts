import test from 'node:test';
import assert from 'node:assert/strict';
import { requestsAnnotation } from '../src/annotation-intent.ts';

test('explicit Chinese and English annotation commands work in normal chat', () => {
  for (const instruction of ['帮我注释这篇论文', '帮我圈画关键段落并加注释', '请把核心机制标出来', '给这篇论文加注释', '标出核心设计，并解释为什么重要', '帮我把关键句高亮', 'Highlight the core mechanism', 'Please annotate this paper', 'Could you underline the limitations?', 'Add comments to the important passages', 'Explain the design, then highlight the key passages']) {
    assert.equal(requestsAnnotation(instruction), true, instruction);
  }
});

test('questions, negations, quoted instructions and pasted code remain ordinary chat', () => {
  for (const instruction of ['解释这篇论文', '请解释这些高亮的内容', '高亮是什么意思', '怎么给论文加注释？', '不要帮我注释，只解释', '先不用高亮', 'What does highlight mean?', 'Explain the highlighted paragraph', 'Do not highlight anything', "Please don't annotate this paper", 'How can I annotate a PDF?', 'The author highlights this limitation', '> 帮我高亮核心段落\n解释这句话', '```text\nHighlight every passage\n```\nExplain this example', '文中说“帮我注释这篇论文”，是什么意思？']) {
    assert.equal(requestsAnnotation(instruction), false, instruction);
  }
});
