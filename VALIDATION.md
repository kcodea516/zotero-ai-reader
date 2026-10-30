# 验证记录

## Colloquial annotation requests: 1.4.0-beta.15

On 2026-10-30, the reported request containing 圈花 was traced to the local annotation-command recognizer. It now normalizes common dictation variants of 圈画 and recognizes source-passage drawing requests, including requests combined with an explanation. Negative, quoted, and diagram-generation requests have regression coverage. TypeScript checks and all 138 automated tests passed.

The installed beta.15 passed 17 native sidebar checks using the exact reported request. An English documentation fixture used a separate copy of Nova, an isolated conversation, and a scripted model response. The real adapter located the output-length sentence on PDF page 9. Clicking Save to PDF produced a green native highlight and an attached English comment; the chat displayed Saved and Undo this batch. Clicking Undo this batch removed the visible highlight and changed the chat to its undone state. No live model request was sent, and the user's original annotations were not edited.

The README screenshots show this request and save sequence in the actual Zotero window. They are cropped native captures, not generated images. The example document was moved to Trash, its tab closed, and the original reader tab and sidebar width restored. The reproducible fixture is `scripts/annotation-showcase.ts`.

## Annotation README screenshots

On 2026-10-30, the README gained an English-only crop from a native Zotero screenshot showing blue underlines on a paragraph in Nova. The crop excludes chat history, endpoint settings, and Chinese interface text. No annotation was changed to take these screenshots.

## Direct PDF requests and conversation scope: 1.4.0-beta.14

On 2026-10-30, the user's exact request was reproduced as a routing failure in beta.13. The fix recognizes that request and other direct Chinese PDF commands, including lowercase `pdf`. The annotation planner now receives up to six recent completed messages, capped at 18,000 characters, to resolve references to earlier discussion.

TypeScript checks and all 137 automated tests passed. In Zotero 10.0.6 on macOS, 17 UI checks passed using the reported wording. A separate fixture passed 14 checks on a disposable PDF using the installed service and annotation adapter: the exact request entered the annotation flow, the prior assistant list reached the planner, both passages were found, and native blue underlines with Chinese comments were saved at PDF coordinates. Duplicate-save prevention, passage navigation, edited-comment protection, and batch undo also passed. The fixture used a simulated model response; live-provider selection quality was not tested.

The installed beta.14 XPI matches the build by SHA-256. Configuration and conversations, including drafts, matched before and after installation. The test PDF was moved to Trash and its tab closed; existing paper annotations were unchanged.

## PDF annotation routing: 1.4.0-beta.13

On 2026-10-30, TypeScript checks and all 135 automated tests passed. New cases cover Chinese passage-search, underline and comment requests, ordinary questions, negations, quoted commands, and requests limited to chat output. A mocked end-to-end test routes a passage request through planning, saves an underline with its comment and coordinates, and undoes that batch.

Version 1.4.0-beta.13 was installed and enabled in Zotero 10.0.6 on macOS. The installed XPI matches the built package by SHA-256. The native annotation UI fixture passed all 17 checks, including passage navigation, selected-candidate saving, receipts, undo, narrow-sidebar layout, and language switching. It used simulated annotation tools and memory-only history. This update did not make real model requests or write annotations into a real PDF; existing annotations were untouched.

## Export menu and tool group: 1.4.0-beta.12

On 2026-10-29, TypeScript checks and all 133 automated tests passed. In Zotero 10.0.6 on macOS, the native export fixture passed 23 checks, including all three format commands, stable conversation snapshots, duplicate-export prevention, and control recovery after saving or cancelling. The fixture also printed a PDF containing Chinese text, tables, math, and images.

After installing beta.12, selecting Markdown, TXT, and PDF from the sidebar each opened the native save dialog with the matching format. Each dialog was cancelled, then the menu was opened again. The bordered Tools group contains Read paper, Search library as needed, and Export on the right. These checks made no model requests.

## Multimodal input: 1.4.0-beta.6

On 2026-10-27, TypeScript checks and all 128 automated tests passed. New tests cover raster file validation and limits, attachment drafts across restart, atomic additions, image-only sends, completed image turns in follow-up context, vision content-part encoding without local filename metadata, multipart reference-image generation, and retry preservation.

The final XPI was installed in Zotero on macOS. Native fixtures passed 122 checks: 20 input-image checks, 61 ordinary-sidebar checks, 20 SVG checks, and 21 image-generation/viewer checks. The new fixture exercised the attachment button through a fake picker, synthetic screenshot paste and file drop events, removal, thumbnail placement above composer text, image-only sends, sent thumbnails and zoom, separate drafts when switching papers, and 24-pixel translucent output-image controls. It used in-memory history and simulated providers. No API credits, system clipboard content, or existing paper annotations were used or changed. The actual operating-system file picker and clipboard-paste bridge were not separately exercised.

## Image generation and viewer: 1.4.0-beta.5

On 2026-10-27, TypeScript checks and all 122 automated tests passed. The suite covers explicit image-intent routing, provider/key reuse, Images API payloads, inline chat image parts, PNG/JPEG/WebP signatures, bounded responses, URL downloads without bearer credentials, blocked private destinations, safe errors, persistence, cancellation, retry, and ordinary follow-up questions without image bytes in model context. API tests use mocked fetch responses.

The final XPI was installed in Zotero on macOS. Two native suites passed 41 checks: 20 SVG checks and 21 image-chat checks. The latter generated PNG and JPG using a fake provider, displayed both in the sidebar, checked the upper-right icon toolbar, opened the image viewer, zoomed in, switched to 100%, closed with Escape, restored focus, copied a PNG payload, exported a JPG payload, and verified the endpoint image-model field. The fixture used memory-only storage and fake clipboard/save sinks. It did not spend API credits, replace the actual system clipboard, or write through the system save dialog. Real-provider model access and API compatibility were not tested.

## SVG previews: 1.4.0-beta.4

On 2026-10-27, TypeScript checks and all 113 automated tests passed. The final XPI was installed in Zotero on macOS. The native graphics fixture passed 20 checks for image decoding, narrow-sidebar sizing, surrounding Markdown, Chinese text, PNG conversion, copy/save payloads, original-code disclosure, standalone SVG, incomplete output, SVG without an explicit namespace, safe CSS, and rejection of active or external content.

The fixture used synthetic diagrams and fake clipboard/file sinks. It did not call a model, change conversation history, write files through the save dialog, or replace the system clipboard. The native clipboard implementation follows Zotero's existing image-copy API; actual cross-application pasting and save-dialog file writes were not separately tested. Remote image URLs and dedicated image-generation APIs remain unsupported.

## Conversational annotations: 1.4.0-beta.3

On 2026-10-24, TypeScript checks and all 112 automated tests passed. New tests cover direct Chinese and English annotation commands, ordinary questions, negated and quoted instructions, follow-up isolation, and disabled paper-reading permission. Routing uses the current user message and does not inspect quoted evidence or previous messages for commands. It is a conservative local command recognizer; ambiguous requests can remain ordinary chat.

The update was installed and enabled in Zotero on macOS. The native annotation fixture passed all 17 checks: no mode toggle, direct chat-to-preview routing, unchanged input node, verified passage selection, narrow-sidebar layout, copy, local passage navigation, explicit save, undo, language switching, and an ordinary follow-up without further writes. The fixture used memory storage and simulated annotation tools; no real provider request or existing library annotation was changed. Exact PDF placement and real-model selection were not retested in this update.

验证日期：2026-10-20 至 2026-10-21。

使用本机 macOS、Zotero 10.0.6 和 Translate for Zotero 2.4.8。1.0.0 的核心功能测试使用独立配置目录和测试文献；1.0.1 的原生控件检查在用户已安装插件的日常配置中进行。

## 1.4.0-beta.2 native verification

On 2026-10-21, version 1.4.0-beta.2 was installed and enabled in Zotero 10.0.6 on macOS. Six native integration suites passed 224 checks: 61 sidebar, 38 paper reading, 36 history, 48 settings, 24 language, and 17 annotation preview checks. TypeScript checks and all 109 automated tests also passed.

Sidebar checks exercised default clipping, expansion and collapse of long user messages, full-text copying and model context, language changes, and preservation of the next draft. Short messages and assistant answers stayed fully visible. The history and settings fixtures initially selected a hidden item-details pane that retained its size. After excluding hidden panes, all checks passed without a runtime plugin change.

A separate synthetic PDF passed 11 native annotation checks using the installed adapter and a fake model response. The adapter located both passages, saved a highlight and an underline with comments, avoided duplicates on repeated save, and navigated to the original passage. Editing a saved comment blocked batch undo and preserved every annotation; restoring that fixture comment allowed undo to trash only the generated batch, leaving a control annotation untouched. Visual inspection confirmed that the highlight and underline covered the intended sentences. The full sequence was repeated for that inspection.

Configuration and all existing conversations, including drafts, matched their pre-update digests. The original PDF tab was restored, and no test tab or overlay remained. Only disposable synthetic records were created; those documents were moved to Zotero Trash after testing. The tests sent no real model requests. Provider-specific annotation proposal quality and arbitrary PDF layouts remain outside this check.

The reusable native fixture is `tests/zotero-native-annotations.integration.js`. Load it in Zotero's Run JavaScript sandbox with `Zotero` available, then call `AIReaderNativeAnnotationChecks.run(win, '/absolute/path/to/tests/fixtures/annotation-fixture.pdf')`. It creates its own document, uses a fake transport, and trashes that document in cleanup. UI fixtures are rebuilt with `npm run build:smoke`. The machine-readable result is in `docs/validation/2026-10-21-beta2.json`.

## 1.4.0-beta.1 annotation prototype

On 2026-10-21, TypeScript checks and all 109 automated tests passed. The XPI and six native integration fixtures compiled successfully. The 15 new tests cover PDF text matching, real-coordinate derivation, ambiguous quotations, malformed plans, selected writes, duplicate saves, rollback, comment escaping, edited-annotation protection, file changes, permissions, cancellation, retry, preview persistence, and empty plans. Tests use synthetic PDFs, fake Zotero items and an in-memory repository; no provider request or actual annotation write was made.

The installed Zotero 10.0.6 source was inspected to check reader page data, annotation fields, transaction behavior, and reader refresh methods. This source review does not confirm runtime behavior. The annotation fixture is prepared but has not been executed; the prototype has not been installed. Native layout, exact highlight placement, comments, and undo remain unverified. The existing Zotero installation and its annotations were not changed.

To run the UI-only annotation fixture later, load `build/annotation-checks.js` in the same sandbox used for the sidebar checks below, then call `AIReaderAnnotationChecks.runAnnotationChecks(win)`. It uses fake annotation tools and memory-only history. Actual native annotation save and undo require a separate disposable PDF after permission to operate Zotero is given.

## 1.3.2 generation activity indicator

On 2026-10-21, TypeScript checks and all 94 automated tests passed. Native integration checks passed on macOS with Zotero 10.0.6: 54 sidebar checks and 24 language checks. The sidebar fixture used simulated streaming, completion, cancellation, and failure with isolated memory storage; no provider requests were sent.

The activity bar stayed inside the native Stop button at a 304-pixel sidebar width. It did not intercept pointer events, and its animation advanced during generation. Completion, cancellation, and failure hid the control and removed its active animation. The existing Stop action cancelled the simulated request. A reduced-motion media rule replaces the animation with a static bar; the fixture checks the branch selected by the system preference and does not toggle that preference.

Version 1.3.2 was installed in the existing Zotero profile. Conversation drafts and non-secret configuration matched their pre-update values.

## 1.3.1 settings layout and README screenshots

On 2026-10-21, TypeScript checks and all 94 automated tests passed. The rebuilt plugin was installed in Zotero 10.0.6 on macOS. The native settings fixture passed 48 checks and the language fixture passed 24 checks, using isolated memory storage and simulated responses.

At both 304- and 760-pixel container widths, the color picker and hex input stayed 32 pixels tall and the hex field stayed under 150 pixels wide. The prompt editor filled its frame with even horizontal padding, and settings had no horizontal overflow. The settings checks also covered saving and reopening, validation, language previews, and preservation of custom prompts and unsaved endpoint fields. Redundant help paragraphs are absent; the custom system prompt remains editable. No model requests were sent by these fixtures.

The two README screenshots were captured from the real native components mounted in Zotero’s visible item-details container. They use a separate in-memory service, an example endpoint, a scripted answer, and illustrative source metadata. No private conversations, keys, or live provider responses were used. The screenshots demonstrate the interface, not answer accuracy or retrieval quality.

The reusable source for these previews is `scripts/showcase.ts`. Run `npm run build:showcase`, load `build/showcase.js` with Zotero’s Run JavaScript tool, and call `AIReaderShowcase.mountShowcase(window, 'chat')` or `'settings'` in that script’s sandbox. The returned object has an asynchronous `close()` method to remove the preview and shut down its isolated service. It does not modify the installed assistant’s configuration or history.

## 1.3.0 interface language

On 2026-10-21, TypeScript checks and all 94 automated tests passed. Five native integration fixtures passed all 187 checks on macOS with Zotero 10.0.6: 48 sidebar, 38 reading, 36 history, 41 settings, and 24 language checks.

Language checks exercised Chinese-to-English and English-to-Chinese changes while preserving the composer input node, unsent questions, quotations, message scroll position, history search and scope, the active history card, and original paper and message text. Switching languages during a simulated streaming response kept that request active and preserved the next question's draft. Source titles still wrapped above their page labels at a 304-pixel sidebar width.

Settings checks covered immediate language preview, repeated toggles with unsaved endpoint, model, key, prompt, and color fields, English validation errors, saving and reopening settings, and applying a language saved elsewhere without losing local drafts. These fixtures used isolated memory storage and simulated responses; they did not send real model requests or change the user's endpoints or keys.

The installed plugin was also checked against the existing profile. Drafts survived the update, the actual sidebar and native section header switched to English, and the native preferences entry and settings content displayed English. Choosing Chinese in the actual settings selector and clicking Save settings restored the Chinese labels. The original interface language was restored after inspection; other saved configuration fields were unchanged. The persistent hint below the reading permissions is absent.

The README contains no Chinese text. UI language changes do not translate saved conversations, paper titles, or custom system prompts. Backend routing and grounding prompts retain their existing behavior.

## 1.2.0 on-demand lookup and source layout

TypeScript checks and all 81 automated tests passed on 2026-10-21. Coverage includes the separate routing request, current-paper-only decisions, explicit comparisons, no carryover of retrieved PDF text into a later ordinary question, disabled permissions, malformed routing output, cancellation, and preservation of current-paper evidence when lookup fails. Explicitly named papers are not padded with broadly related matches.

The installed 1.2.0 passed all 147 native integration checks on macOS with Zotero 10.0.6: 48 sidebar, 38 reading, 36 history, and 25 settings checks. The reading fixture extracted the actual Nova PDF (14 pages supplied) and UnifiedServe PDF (3 of 16 pages supplied), then used simulated model responses for four rounds: current paper, explicit comparison, current paper again, and reading disabled. It mounted inside Zotero's actual item-details subtree and checked wrapped source-title height, page-number separation, and the 304-pixel width bound. Automated routing tests use simulated model decisions and do not measure real-model decision accuracy.

The settings fixture used isolated in-memory configuration and fake endpoints. It checked collapsed endpoint cards, draft preservation, adding endpoints and models, custom color preview and save, immediate updates to mounted user messages, and reset without changing endpoint settings. It sent no network requests and did not read real keys or write the user's configuration.

After installation, the existing conversation drafts matched their pre-update values. Geometry checks on the actual conversation showed all four historical source cards placed page labels below their wrapped titles; the sidebar measured about 308 pixels wide. The existing user message background was `rgb(234, 243, 255)`, matching the default light blue. Screenshots confirmed the light blue user bubble and collapsed endpoint summary in the actual settings page.

## 1.1.1 独立历史页

2026-10-21，在 macOS Zotero 10.0.6 中安装 1.1.1，36 项历史页实机脚本检查通过：

- 历史记录独占侧栏页面，聊天工具栏、论文信息、消息和输入区在历史页隐藏。
- 三段测试会话覆盖同一论文与另一篇论文，卡片显示标题、所属论文、日期时分、最近消息、问答轮数和当前会话标记。
- 当前文献与全部历史筛选、消息正文搜索、无匹配提示、选择会话和返回操作正常。
- 切换会话后恢复各自消息与未发送草稿；从其他论文的历史中添加当前 PDF 引用时返回当前论文的聊天。
- 重命名与删除操作只作用于测试用内存会话。用户的历史、文库和接口配置未参与这些测试。
- 测试覆盖层放在真实 Zotero `item-details` 内，继承其全局控件样式。卡片高度能容纳正文，操作行位于正文下方；20 张卡片在列表内部滚动，304 像素宽容器没有被撑宽或出现横向溢出，也不会露出聊天输入区。

测试使用隔离的内存存储和模拟接口，不发送真实模型请求。类型检查和 55 项自动化测试通过；48 项侧栏检查和 25 项真实原文读取检查也在 1.1.1 上复跑通过。

另行调用实际来源跳转，在 Nova 中确认阅读器从 PDF 第 5 页到达引用的第 4 页，再恢复第 5 页。该检查读取了 PDF.js 的实际当前页，没有使用模拟导航回调。实际侧栏截图也确认返回按钮、搜索框和卡片信息可见；根容器宽约 308 像素，位于 320 像素的原生条目面板内。

## 1.1.0 原文读取与文库联查

2026-10-21，55 项自动化测试通过，其中包含本轮新增的原文读取和跨文献检索测试。自动化测试使用模拟的 Zotero 条目、PDF 文字提取结果和接口响应，覆盖：

- 提问前取得当前论文与相关论文的文字；缺少当前原文时仍可读取相关论文，并保留缺失提示。
- 按论文名称和主题选择同一文库中的相关条目，排除其他文库、回收站和笔记。仅属于同一分组不足以让无关论文进入请求。
- 短论文完整材料、长论文的 System Overview 相关页和续页选择、上下文字符预算，以及 PDF 实际页码。
- 不完整索引和缺少分页边界时明确提示，不编造页码，也不把部分索引当作整篇论文。
- 当前阅读器附件优先、PDF 修改后缓存失效、读取选项关闭后的行为，以及近期追问中提到的论文。
- 自定义系统提示词下的来源约束、历史来源说明、重新检索后重试，以及原文读取过程中停止后不调用模型接口。
- 会话保留问答和来源元数据，不写入自动提取的全文；可恢复旧历史，错误信息不泄漏本地附件路径。

随后在 macOS、Zotero 10.0.6 中运行原文联查检查，25 项全部通过。该检查从本地真实 PDF 提取原文，使用模拟的 API 响应完成连续三轮对话。本轮发送的材料包括：

| 文献 | PDF 总页数 | 本轮提供的页数 |
| --- | ---: | ---: |
| Nova | 14 | 14 |
| UnifiedServe | 16 | 3 |
| ModServe | 14 | 3 |
| TCM-Serve | 12 | 2 |

检查确认真实原文进入模拟 API 请求，来源详情与实际发送的论文一致。点击引用时，回调收到正确的附件和 PDF 实际页码；不存在的页码不会触发跳转。关闭读取选项后跳过提取，自动提取的全文没有写入会话历史。

实机检查验证了文献读取、上下文传递和界面回调，没有调用真实模型服务，也没有评估模型回答的准确性。引用检查核对了跳转回调参数，未单独验证阅读器完成翻页后的屏幕位置。

## 1.0.2 多轮对话与布局修复

2026-10-21，TypeScript 类型检查和原有 28 项自动化测试通过。将 `tests/zotero-sidebar.integration.ts` 打包后，通过 Zotero 的 Run JavaScript 在独立测试视图中执行，48 项检查全部通过：

- 连续完成三轮对话，第二轮和第三轮请求都包含此前成功完成的上下文。
- 第一轮模拟 110 段长回答流式输出，对话区域内部滚动，输入框保留在可见区域；生成期间输入的草稿在回答结束后保留。
- 六条用户和 AI 消息均显示边框，复制图标位于各消息下方，点击后捕获到相应的复制内容。
- 输入框未获得焦点时仍显示边框。304 像素宽侧栏没有横向溢出，输入框位于视口内。
- 模拟输入法组合事件时，Enter 不触发发送。Shift+Enter 事件允许原生默认行为，测试再显式插入换行检查草稿同步；这不等同于真实键盘和输入法测试。

1.0.2 已实际安装到 Zotero，现有侧栏的尺寸检查确认输入区位于可见范围。截图核对了消息卡片、下方复制图标和未聚焦输入框边框。

本轮通过模拟接口响应检查交互，没有调用真实模型服务。复制检查捕获的是插件发出的复制内容，没有对操作系统剪贴板另做端到端核验。

## 1.0.1 原生界面更新

按钮、模型和历史范围菜单、多行输入框改用翻译插件使用的 XUL 控件。移除网页按钮的边框和多行输入框的自定义焦点外观，交由 Zotero 绘制；按钮间距和分隔线沿用翻译模块的样式。

2026-10-21，最终 1.0.1 已安装并启用。类型检查和原有 28 项自动化测试通过，19 项实机脚本检查全部通过：三个工具栏按钮的命名空间、字体、背景、边框及内边距均与翻译按钮一致；输入同步、发送按钮、Enter 发送、Shift+Enter 换行、模拟中文输入法事件和模型选择事件正常；输入框占满侧栏宽度，侧栏没有横向溢出。普通 Escape 保留当前草稿，中文输入法组合期间的 Escape 保留默认行为；未聚焦时拖入文字会同步一次，正常拖入不会重复触发输入事件。

实际截图核对确认，按钮的圆角、阴影和间距，以及文本区未聚焦时的透明背景均与翻译模块一致；输入框聚焦时显示原生细蓝边框。另行检查了历史和设置入口：历史面板能展开范围菜单、搜索框及会话列表，设置入口能打开 Zotero 原生设置页，模型和系统提示词显示正常。

以上实机脚本临时替换发送方法，只检查事件触发次数，结束后恢复原方法和草稿，没有调用真实模型接口。

## 1.0.x 自动化测试

以下记录对应 1.0.x：TypeScript 类型检查通过，28 项自动化测试通过。测试覆盖多模型上下文、请求期间的模型快照、多文献会话、草稿与引用恢复、生成中断恢复、停止与重试、串行保存、损坏文件保护、API 错误脱敏、中文 SSE 分片、超时和取消。

密钥存储测试使用模拟的系统密钥库和登录管理器，检查密文写入、接口隔离、加密失败后的临时保存及通用错误信息。没有使用真实 API Key，也没有写入真实系统密钥库。

## Zotero 集成检查

在独立 Zotero 进程中，两个本地模拟接口分别完成流式和非流式调用。第二个模型收到此前成功完成的对话，历史中的模型名称保持不变。

最后一轮 26 项检查全部通过，包括：

- 进程重启后恢复历史，插件在原生阅读侧栏中正常挂载。
- AI 模块紧邻翻译下方；翻译停用再启用后，顺序和聊天视图仍正确。
- 304 像素宽侧栏下布局可用，原生模型选择器与中文输入法的 Enter 行为正确。
- Markdown、代码块和本地数学公式正常生成；脚本与远程图片测试内容保持不可执行。
- 已注册的选区事件可展开原生侧栏，并将文字加入可编辑引用；该操作不会发送问题。
- 原生设置页恢复两个接口，保存默认模型，完成独立连接测试；测试不写入聊天历史。
- 插件停用后移除自有全局对象，重新启用后恢复历史，选区事件不重复注册。

随包发布的运行依赖在检查时没有 npm audit 报告的已知漏洞。依赖检查结果会随上游公告变化。

## 验证边界

实际模型服务的鉴权、额度、可用模型和返回格式，需要用户填入自己的配置后通过连接测试确认。未验证其他 Zotero 版本或操作系统，也未对长时间使用及超大规模历史进行性能测试。

更新使用手动安装方式。插件清单中的更新地址指向本仓库的 [GitHub 更新清单](https://raw.githubusercontent.com/kcodea516/zotero-ai-reader/main/updates.json)。后台自动更新安装仍关闭；Zotero 可能读取更新清单进行检查。

## 复跑侧栏检查

运行 `npm run build:smoke`，将 `build/sidebar-checks.js` 加载到 Zotero 的“工具 → 开发者 → Run JavaScript”。启用“作为异步函数执行”，把下面的路径换成实际文件路径：

```js
const win = Zotero.getMainWindow();
const fixture = {
  Zotero,
  setTimeout: win.setTimeout.bind(win),
  clearTimeout: win.clearTimeout.bind(win),
  AbortController: win.AbortController,
  console: win.console,
};
Services.scriptloader.loadSubScript(
  "file:///absolute/path/to/zotero-ai-reader/build/sidebar-checks.js",
  fixture,
);
return await fixture.AIReaderSidebarChecks.runSidebarChecks(win);
```

先安装当前版本插件，使其样式已加载到 Zotero 主窗口。成功时返回检查名称列表；失败时返回具体检查名称。检查使用内存会话和模拟响应，结束后移除测试覆盖层。

## Interactive SVG preview: 1.4.0-beta.10

Checked on Zotero 10.0.6 on macOS, 2026-10-27. TypeScript checks and all 129 automated tests passed. Native checks in `zotero-svg.integration.ts`, `zotero-graphics.integration.ts`, and `zotero-image-chat.integration.ts` passed 56 assertions, including asynchronous completion checks.

The SVG fixture covers SMIL and CSS animation, script timers, `requestAnimationFrame`, inline click handlers, pause/resume, timeline seeking, restart, zoom, and frame cleanup. It verifies an opaque origin, denied access to the Zotero window and privileged APIs, blocked storage and network access, and original SVG preservation during copy and save. Raster copying, PNG/JPG export, image generation with a simulated provider, and ordinary chat were also checked.

After installation, an existing SVG from chat history loaded with eight animation elements. Its timeline advanced, and the native pause button stopped it. Tests used no real model requests and made no library or annotation changes.

The viewer runs self-contained diagrams offline. Timeline seeking controls SVG/CSS animations; restarting resets scripted state. Pause covers SMIL, CSS/Web Animations, and scripts using animation-frame callbacks or function-based timers. It does not suspend arbitrary JavaScript execution or reconstruct scripted state at an arbitrary timeline position. PNG/JPG copying and export use the static thumbnail.

## Conversation export: 1.4.0-beta.11

Checked on Zotero 10.0.6 on macOS, 2026-10-29. TypeScript checks and all 133 automated tests passed. The native export fixture passed 22 checks covering the three format choices, stable conversation snapshots, save/cancel handling, complete message content, image embedding, and PDF rendering.

A 12-message bilingual fixture produced a six-page A4 PDF. Rendered pages were inspected for Chinese text, tables, code, MathML formulas, raster images, and a static SVG diagram. All three formats were also saved through the installed plugin's native file picker. A separate check changed the destination to a temporary directory and verified the resulting file. The current-paper header and export menu were checked in the reader.

Tests used synthetic conversations and made no model requests or library changes. TXT records image labels; Markdown embeds raster images and retains SVG source; PDF renders static images. Unsent drafts are excluded. An in-progress answer is exported as a snapshot with its status.
