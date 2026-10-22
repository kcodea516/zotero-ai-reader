# Zotero AI Reader: a native sidebar for paper Q&A — feedback and contributors welcome

I'm sharing Zotero AI Reader, an independent open-source plugin for discussing papers inside Zotero's PDF reader.

The focus is a small, native interface for understanding a paper: ask about the PDF you have open, follow up in the same sidebar, and return to the cited pages. It uses Zotero's native controls and supports English and Chinese.

The stable release (1.3.2) can:

- Read local PDF text for paper questions without requiring you to paste each passage.
- Show source papers and PDF-page citations that open the original document.
- Look up other local papers in the same library when a comparison needs them, rather than attaching other papers to every question.
- Keep multi-turn conversations and local history, with model switching, stop/retry, Markdown, and math rendering.
- Use your own OpenAI-compatible Chat Completions endpoint and model.

Repository, screenshots, and setup: https://github.com/kcodea516/zotero-ai-reader
Stable XPI download: https://github.com/kcodea516/zotero-ai-reader/releases/tag/v1.3.2
Bug reports, questions, and suggestions: https://github.com/kcodea516/zotero-ai-reader/issues/new/choose
Contributing guide: https://github.com/kcodea516/zotero-ai-reader/blob/main/CONTRIBUTING.md

The release targets Zotero 10.0.6–10.0.x and has been checked on macOS with Zotero 10.0.6. Windows and Linux compatibility reports would be useful.

There is also a source preview branch for collapsible long user messages and an annotation agent. The annotation preview locates proposed passages in the PDF and lets you review and select highlights/underlines with comments before saving them. These features are experimental and are not included in the stable 1.3.2 XPI; the README explains how to build the preview.

The plugin is free under the MIT license. Model usage is billed by your provider if applicable. Conversations stay in the local Zotero profile; enabled reading permissions send paper excerpts to the endpoint you configure. This is not an offline-only tool unless your chosen endpoint is local and operates offline.

I'd like to develop this with feedback from people who use it. Reproducible bugs, endpoint compatibility reports, accessibility suggestions, and documentation improvements are welcome. Please include your plugin/Zotero versions and operating system in reports, and remove API keys and private material. If you'd like to contribute code or help maintain an area over time, an issue or pull request is welcome. English and Chinese issues are both fine.

This is an independent plugin, not an official Zotero product.
