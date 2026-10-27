# Changelog

## 1.4.0-beta.6 (preview)

- Attach PNG/JPG/WebP images with the native picker, screenshot paste, or file drop.
- Show removable thumbnails above the composer text and preserve images with sent messages and local drafts.
- Send vision-compatible image content parts with current and completed user turns.
- Use the Images Edit API for generation requests with attached reference images.
- Shrink image-toolbar controls to 24 pixels and make them translucent until hover or focus.
- Highlight GPT API image generation and multimodal input in the README.

## 1.4.0-beta.5 (preview)

- Generate images from explicit chat instructions using the selected endpoint and saved key, with a configurable image model ID.
- Display PNG, JPEG, and WebP results and retain them in local history.
- Open SVG and raster images in a window-sized zoom viewer.
- Move copying to an upper-right icon and place saving/source actions in a compact menu.
- Handle compatible chat image content parts, stop/retry, bounded image responses, and credential-free image URL downloads.

## 1.4.0-beta.4 (preview)

- Preview complete SVG diagrams directly in chat and keep the original code in a disclosure.
- Add native actions to copy a PNG image, save PNG/SVG files, and copy sanitized SVG source.
- Restrict previews to static local SVG content and preserve ordinary remote-image blocking.

## 1.4.0-beta.3

- Request PDF highlights and comments directly in chat, without enabling a separate annotation mode.
- Keep passage review, explicit saving, and batch undo.


## 1.4.0-beta.2 (preview)

- Collapse long user messages and quoted passages into a six-line preview with bilingual Show more and Show less controls.
- Preserve expanded messages during streaming and language changes; keep the full text for copying, export, and model context.
- Keep short messages and assistant answers fully visible.
- Verify the installed preview on Zotero 10.0.6 with 224 native UI checks and 11 native annotation checks using a synthetic PDF and fake model responses.

## 1.4.0-beta.1 (preview)

- Add an opt-in annotation mode that reads the current PDF and proposes highlights or underlines with explanatory comments.
- Verify quoted passages against local PDF coordinates, show a selectable preview, and save only the selected annotations.
- Add batch undo with edit detection, repeated-save protection, and atomic batch writes.
- Keep annotation previews in conversation history and include quotations and comments when copying or exporting.
- Preserve the stable update feed when building a prerelease. Native installation and annotation checks are pending.

## 1.3.2

- Add a looping activity bar along the bottom of the native Stop button while a response is being generated. The bar indicates activity without estimating completion.
- Hide the indicator when generation completes, fails, or stops; use a static indicator when reduced motion is requested.

## 1.3.1

- Remove repeated explanatory paragraphs from Settings while keeping the editable system prompt and validation messages.
- Make the color picker and hex input compact, with a fixed single-line height.
- Expand the system prompt editor across its field with even padding.
- Add README screenshots of the native reading sidebar and settings, using sample data.

## 1.3.0

- Add Chinese and English interface selection in Settings, with an immediate preview and saved preference.
- Translate the sidebar, history page, settings, source labels, selection action, and status messages without rewriting saved conversations or custom prompts.
- Preserve chat and endpoint drafts when switching languages, including during an active response.
- Remove the persistent reading hint below the paper permissions.
- Keep the README entirely in English.

## 1.2.0

- Replace automatic related-paper attachment with on-demand library lookup. Enabling the option permits a model routing decision; other papers are read only when that decision calls for a search.
- Instruct the router to keep ordinary explanations and translations on the current paper. Do not automatically resend previously retrieved PDF text on subsequent ordinary questions. When explicitly named papers match, return those matches without adding broad topic matches to fill unused slots.
- Clarify that lookup covers the same Zotero library, including papers outside the current collection. Failed routing skips lookup while preserving available current-paper evidence.
- Give each source its own block. Reset native fixed button heights so long titles wrap above their page numbers without overlap.
- Collapse existing endpoint settings into summary cards, keep new endpoints open for editing, and preserve model and key drafts when toggling cards.
- Add a light blue default for user messages, a color picker and hex input, a contrast preview, and a reset-to-default action.
- Publish an English README and English release notes. The Zotero interface remains in Chinese.

## 1.1.1

- 将历史记录改为侧栏中的独立页面，选择会话后进入聊天，支持返回原对话。
- 用卡片区分不同会话，显示所属论文、完整更新时间、最近消息和问答轮数，标记当前会话。
- 保留按文献筛选、全文搜索、重命名与删除，以及每段会话的草稿和引用。

36 项历史页实机脚本检查、类型检查和 55 项自动化测试通过。实机测试使用独立内存会话和模拟接口。安装包见 [1.1.1 发布页](https://github.com/kcodea516/zotero-ai-reader/releases/tag/v1.1.1)。

## 1.1.0

- 发送问题时自动读取当前文献的本地 PDF 原文，支持直接询问章节内容。
- 从同一文库选择最多 3 篇相关论文，读取本地附件用于比较和追问；不自动联网搜索或下载文献。
- 为回答补充来源详情与 `[S1 p.4]` 引用，点击可打开对应 PDF 页。页码使用 PDF 的实际页序。
- 增加按会话保存的“读取原文”和“联查文库”开关，默认开启。两项关闭后仅使用手动材料和对话。
- 为长论文选择相关页摘录，提示未覆盖内容；无法提取原文时明确说明，不把题录当作正文。
- 停止操作覆盖原文读取阶段，重试会重新准备材料。自动提取的正文只留在运行内存中，会话保存来源元数据。

55 项自动化测试和 25 项 Zotero 实机脚本检查通过，覆盖真实 PDF 原文读取、连续三轮对话、来源显示和引用回调。实机回答使用模拟响应，没有测试真实模型回答的准确性；具体范围见 [验证记录](VALIDATION.md)。安装包见 [1.1.0 发布页](https://github.com/kcodea516/zotero-ai-reader/releases/tag/v1.1.0)。

## 1.0.2

- 将对话记录放入限定高度的滚动区域，保留底部输入框，避免长回答把追问入口推到不可见的位置。
- 为用户和 AI 消息添加边框，在消息下方提供复制图标。
- 为未获得焦点的输入框保留边框。
- 补充公开仓库的安装说明、反馈入口和构建 CI。

类型检查和原有 28 项自动化测试通过。在 macOS Zotero 10.0.6 中执行的 48 项侧栏检查全部通过，覆盖三轮对话上下文、长回答滚动、生成中草稿保留、消息复制、边框及窄侧栏布局。已安装 1.0.2 并核对实际界面；本轮未调用真实模型接口。检查方法和边界见 [验证记录](VALIDATION.md)。

## 1.0.1

已有功能包括按文献保存的多轮对话、自定义 OpenAI 兼容接口、模型切换、选区提问，以及本地 Markdown 和数学公式渲染。
