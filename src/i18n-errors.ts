/** Safe messages created by the plugin, with an English form for the UI. */
export interface BilingualError extends Error { englishMessage: string }
export function bilingualError(chinese: string, english: string): BilingualError {
  return Object.assign(new Error(chinese), { englishMessage: english });
}

/** Static pairs also localize known messages saved by earlier plugin versions. */
export const ERROR_TRANSLATIONS: readonly (readonly [string, string])[] = [
  [
    "AI 配置格式无效。",
    "The AI configuration format is invalid."
  ],
  [
    "API 配置不完整或存在重复 ID。",
    "The API configuration is incomplete or contains duplicate IDs."
  ],
  [
    "模型配置不完整、接口不存在或存在重复 ID。",
    "A model configuration is incomplete, references a missing endpoint, or contains a duplicate ID."
  ],
  [
    "默认模型不存在。",
    "The default model does not exist."
  ],
  [
    "对话历史格式无效。",
    "The conversation history format is invalid."
  ],
  [
    "对话历史中的会话数据损坏。",
    "Conversation data in the saved history is damaged."
  ],
  [
    "对话引用数据损坏。",
    "Saved quotation data is damaged."
  ],
  [
    "对话历史中的消息数据损坏。",
    "Message data in the saved history is damaged."
  ],
  [
    "对话历史索引损坏。",
    "The conversation history index is damaged."
  ],
  [
    "当前文献标识无效。",
    "The current paper identifier is invalid."
  ],
  [
    "文献读取选项无效。",
    "The paper-reading options are invalid."
  ],
  [
    "所选模型不存在。",
    "The selected model does not exist."
  ],
  [
    "对话不存在。",
    "The conversation does not exist."
  ],
  [
    "AI 对话尚未初始化。",
    "AI conversations have not been initialized."
  ],
  [
    "AI 对话正在关闭。",
    "AI conversations are shutting down."
  ],
  [
    "请先在设置中添加 API 和模型。",
    "Add an API endpoint and model in Settings first."
  ],
  [
    "API 密钥读取失败，请在设置中重新保存密钥。",
    "The API key could not be read. Save it again in Settings."
  ],
  [
    "已停止生成。",
    "Generation stopped."
  ],
  [
    "API 地址无效，请填写完整的 http(s) 地址。",
    "The API address is invalid. Enter a complete HTTP(S) URL."
  ],
  [
    "API 地址必须是 http(s) 地址，且不能包含用户名、密码、查询参数或锚点。",
    "The API URL must use HTTP(S) and must not contain credentials, query parameters, or fragments."
  ],
  [
    "API 地址或模型不存在（404），请检查接口地址和模型 ID。",
    "The API endpoint or model was not found (404). Check the address and model ID."
  ],
  [
    "问题或历史记录过长（413），请缩短内容或新建会话。",
    "The question or history is too long (413). Shorten it or start a new conversation."
  ],
  [
    "API 请求受限（429），请稍后手动重试或检查额度。",
    "The API request was rate-limited (429). Retry later or check your quota."
  ],
  [
    "API 返回错误，请检查模型、额度及上下文长度。",
    "The API returned an error. Check the model, quota, and context length."
  ],
  [
    "API 返回格式不受支持，需要 Chat Completions 格式。",
    "The API response format is unsupported. Chat Completions format is required."
  ],
  [
    "API 未完成回答：内容被服务端过滤。",
    "The API did not complete the answer because the server filtered its content."
  ],
  [
    "API 连接或响应超时，请手动重试。",
    "The API connection or response timed out. Retry manually."
  ],
  [
    "无法连接 API，请检查网络、地址和证书；接口重定向不受支持。",
    "Could not connect to the API. Check the network, URL, and certificate; endpoint redirects are unsupported."
  ],
  [
    "API 响应超时，请手动重试。",
    "The API response timed out. Retry manually."
  ],
  [
    "API 返回了无效的 JSON。",
    "The API returned invalid JSON."
  ],
  [
    "API 没有返回可读取的响应。",
    "The API returned no readable response."
  ],
  [
    "API 流式数据格式无效，请手动重试。",
    "The API stream format is invalid. Retry manually."
  ],
  [
    "API 在生成过程中返回错误，请检查额度、模型及上下文长度。",
    "The API returned an error during generation. Check the quota, model, and context length."
  ],
  [
    "API 连接中断，请手动重试。",
    "The API connection was interrupted. Retry manually."
  ],
  [
    "API 响应意外中断，已保留收到的文字，请手动重试。",
    "The API response ended unexpectedly. Received text has been preserved; retry manually."
  ],
  [
    "无法读取 AI 对话记录。原文件已保留。",
    "AI conversation history could not be read. The original file has been preserved."
  ],
  [
    "无法解锁此接口的 API Key，请在设置中重新输入。",
    "The API key for this endpoint could not be unlocked. Enter it again in Settings."
  ],
  [
    "无法从安全存储删除此接口的 API Key。",
    "The API key for this endpoint could not be deleted from secure storage."
  ],
  [
    "上次生成因 Zotero 退出而中断，可手动重试。",
    "The previous answer was interrupted when Zotero closed. Retry manually."
  ],
  [
    "无法读取 AI 对话数据，可能已损坏。为保护原文件，已停止写入。",
    "AI conversation data could not be read and may be damaged. Writing is disabled to protect the original file."
  ],
  [
    "AI 对话保存失败，当前内容暂留在内存中。请检查磁盘权限和空间。",
    "AI conversations could not be saved. Current content remains in memory; check disk permissions and space."
  ],
  [
    "保存失败",
    "Save failed"
  ],
  [
    "未读取到文献原文；本轮回答不能核实论文中的具体表述。",
    "No paper text was retrieved; this answer cannot verify the paper's specific statements."
  ],
  [
    "正在读取当前文献原文…",
    "Reading the current paper text…"
  ],
  [
    "当前文献原文读取失败；本轮未取得该文献原文。",
    "The current paper text could not be read; it is unavailable for this round."
  ],
  [
    "正在判断是否需要其他文献…",
    "Checking whether other papers are needed…"
  ],
  [
    "按需联查判断失败，本轮未查询其他文献。",
    "The lookup decision failed; no other papers were searched this round."
  ],
  [
    "正在查找其他文献…",
    "Looking up other papers…"
  ],
  [
    "本轮已尝试联查，未取得其他文献原文。",
    "Library lookup was attempted, but no other paper text was retrieved."
  ],
  [
    "已按需查询其他文献。",
    "Other papers were searched on demand."
  ],
  [
    "相关文献原文读取失败，已保留当前文献材料。",
    "Related paper text could not be read. Current-paper evidence has been retained."
  ],
  [
    "相关文献原文读取失败；本轮未取得相关原文。",
    "Related paper text could not be read and is unavailable for this round."
  ],
  [
    "本轮仅使用当前论文，未查询其他文献。",
    "This round uses only the current paper; no other papers were searched."
  ],
  [
    "本轮未查询其他文献。",
    "No other papers were searched this round."
  ],
  [
    "已关闭文库联查；本轮仅使用当前论文。",
    "Library lookup is disabled; this round uses only the current paper."
  ],
  [
    "已关闭文库联查。",
    "Library lookup is disabled."
  ],
  [
    "已关闭文献原文读取；本轮仅使用对话内容。",
    "Paper reading is disabled; this round uses only the conversation."
  ],
  [
    "本轮已查询文库，未取得其他论文原文。",
    "The library was searched, but no other paper text was retrieved."
  ],
  [
    "回答达到模型输出上限，内容可能未完。",
    "The answer reached the model output limit and may be incomplete."
  ],
  [
    "文献原文读取已停止。",
    "Paper-text reading stopped."
  ],
  [
    "已停止生成，可重试这一轮。",
    "Generation stopped. You can retry this round."
  ],
  [
    "调用失败，请检查 API 配置、密钥和网络后重试。",
    "The request failed. Check the API settings, key, and network, then retry."
  ],
  [
    "未能确认是否需要联查文库；本轮未检索其他文献。",
    "Could not determine whether library lookup was needed; no other papers were searched this round."
  ],
  [
    "当前文献没有可提取的正文（可能是扫描件或尚未完成文字识别）。",
    "The current paper has no extractable text; it may be a scan or still need OCR."
  ],
  [
    "未读取到当前文献正文。",
    "The current paper text was not retrieved."
  ],
  [
    "部分文献仅提供了相关页摘录，未覆盖的内容不能视为已经阅读。",
    "Some papers are supplied as relevant-page excerpts only. Content outside those excerpts has not been read."
  ],
  [
    "未能读取当前文献的完整本地 PDF 原文；请确认附件已下载、PDF 可提取文字。回答中不得假称已经读过该文献。",
    "The complete local PDF text could not be read. Check that the attachment is downloaded and has extractable text. Do not claim to have read it."
  ],
  [
    "相关文献未找到可读取的完整本地 PDF，未把题录冒充原文。",
    "No readable complete local PDF was found for the related papers; metadata was not used as original text."
  ],
  [
    "API 鉴权失败（",
    "API authentication failed ("
  ],
  [
    "），请检查密钥及调用权限。",
    "). Check your API key and permissions."
  ],
  [
    "API 服务暂时不可用（",
    "The API service is temporarily unavailable ("
  ],
  [
    "），请稍后手动重试。",
    "). Retry later."
  ],
  [
    "API 请求失败（",
    "The API request failed ("
  ],
  [
    "），请检查接口配置、模型及上下文长度。",
    "). Check the endpoint settings, model, and context length."
  ]
];
