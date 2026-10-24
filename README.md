<h1 align="center">Zotero AI Reader:<br />Understand papers without leaving Zotero</h1>

<p align="center">
  <strong>A native, simple sidebar for reading and discussing papers.</strong><br />
  Ask about the current PDF, follow up in context, and return to the cited pages.
</p>

<p align="center">
  <a href="#installation">Install</a> ·
  <a href="#what-it-does">Features</a> ·
  <a href="#release-channels">Preview</a> ·
  <a href="https://github.com/kcodea516/zotero-ai-reader/issues/new/choose">Report an issue</a> ·
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

<p align="center">
  <a href="https://github.com/kcodea516/zotero-ai-reader/releases/latest"><img src="https://img.shields.io/github/v/release/kcodea516/zotero-ai-reader?label=release&amp;color=c9313e" alt="Latest stable release" /></a>
  <a href="https://github.com/kcodea516/zotero-ai-reader/releases"><img src="https://img.shields.io/github/downloads/kcodea516/zotero-ai-reader/total?color=c9313e" alt="GitHub release downloads" /></a>
  <a href="https://github.com/kcodea516/zotero-ai-reader/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/kcodea516/zotero-ai-reader/ci.yml?branch=main&amp;label=CI" alt="CI status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/kcodea516/zotero-ai-reader?color=555" alt="MIT license" /></a>
</p>

Zotero AI Reader keeps the PDF and its discussion together. It uses Zotero's native controls, reads local paper text when permitted, and works with your own OpenAI-compatible Chat Completions endpoint. The interface supports English and Chinese.

**Feedback and contributors are welcome.** [Report a bug](https://github.com/kcodea516/zotero-ai-reader/issues/new?template=bug_report.yml), [suggest an improvement](https://github.com/kcodea516/zotero-ai-reader/issues/new?template=feature_request.yml), or help with testing, documentation, and code through the [contribution guide](CONTRIBUTING.md). You can write an issue in English or Chinese.

## In use

<p align="center">
  <img src="docs/images/reading-sidebar.png" width="420" alt="Native Zotero sidebar showing a paper discussion, page citations, source cards, and the follow-up input" />
</p>

The input stays below the conversation. Each answer can show the papers and PDF pages supplied for that turn; a page citation opens the local PDF. The screenshots use the actual macOS interface with a sample conversation and example endpoint, rather than live provider responses.

## What it does

- **Read the current paper.** Ask for a section explanation, a definition, or an account of the method and its assumptions. Available original text is read automatically, so you do not have to paste each passage.
- **Check the source.** Inspect which papers and pages were supplied, then click a citation to return to the PDF. Partial coverage is disclosed.
- **Compare papers when needed.** Permit on-demand lookup across the same Zotero library, including other collections. Ordinary follow-up questions stay on the current paper unless the lookup decision calls for other sources.
- **Keep a conversation.** Follow up, switch models, stop generation, or retry an incomplete turn. History has its own page with search, titles, and preserved drafts.
- **Choose your setup.** Configure multiple endpoints and models, switch the interface language, and customize the user-message color. Answers support Markdown, code, and local math rendering.

If Translate for Zotero is installed, AI Reader appears below its translation section. Translate for Zotero is optional.

## Installation

1. Download `zotero-ai-reader-1.3.2.xpi` from the [stable release](https://github.com/kcodea516/zotero-ai-reader/releases/tag/v1.3.2).
2. In Zotero, open **Tools → Plugins**, then choose **Install Plugin From File** from the gear menu.
3. Select the XPI, open a PDF, and expand **AI Reader** in the right sidebar.
4. Open **Settings**, add an endpoint and model, save, and ask your first question.

The release targets Zotero **10.0.6–10.0.x** and has been checked on **macOS with Zotero 10.0.6**. Windows and Linux reports are welcome; they have not been verified. [Validation records](VALIDATION.md) describe the checks and their limits.

Updates are installed manually using the same steps. Updating preserves local conversations and endpoint settings. Installing a release does not require Node.js or Python.

## Connect a model

In **Settings**, add the endpoint name, Base URL, and API key. Then add a model display name and its actual model ID. Leaving the key field blank retains a saved key; clearing it uses a separate action.

Accepted address shapes include:

```text
https://api.example.com/v1
https://gateway.example.com/custom/v1/chat/completions
http://127.0.0.1:1234/v1
```

Use your provider's address. Public endpoints require HTTPS; HTTP is supported for local loopback addresses. The endpoint must accept Chat Completions `model`, `messages`, and `stream` fields. Native Anthropic Messages, Gemini, and Responses protocols need a compatible gateway. Endpoint cards expand for editing, and multiple models can share an endpoint.

The connection-test button sends a short request to the selected provider and may incur charges. It does not add a conversation. Plugin use is free; model-provider usage is separate.

<details>
<summary>Settings: endpoints, language, and message appearance</summary>

<img src="docs/images/settings.png" width="740" alt="Settings with an English language selector, collapsed endpoint card, prompt editor, and compact message-color controls" />

Choose **Chinese** or **English** under **Interface language**, or change the bubble color under **Chat appearance**, then save. Language changes translate the interface while preserving saved messages, paper titles, and your custom system prompt. To change the answer language, ask the model or edit your prompt.

</details>

## Reading workflow

Try a question such as:

> Explain the System Overview section and show which pages support your explanation.

> What assumptions does this method make, and which limitations are stated in the paper?

> Compare this paper with another paper in my library. Separate their claims from your interpretation.

Two per-conversation permissions control retrieval:

| Setting | Behavior |
| --- | --- |
| Read paper | Read the current paper's local PDF before answering. |
| Search library as needed | Allow a model decision about whether to search other papers in the same library. |

Both are enabled by default. Library lookup can read up to three related local PDFs. It does not search the web, download missing papers, or automatically attach other papers to every question. Routing uses an additional short request containing the current question, recent questions, paper title, and a bounded current-paper excerpt when enabled. A routing failure skips library lookup and preserves available current-paper evidence.

Short PDFs can be supplied in full; longer ones use selected pages and nearby passages. Text extraction can miss figures, equations, or layout relationships. Scans need OCR in another tool. Treat page citations as a way to inspect the evidence, and check the PDF when accuracy matters. PDF page numbers count from the first page of the file.

Press **Enter** to send and **Shift+Enter** for a newline. Select PDF text and choose **Ask AI** to add an editable quotation without sending it. Use the copy icon below a message, or copy a full conversation as Markdown from **History**. Completed turns are sent with follow-up questions; switching providers sends that conversation to the newly selected endpoint. Failed and stopped turns are excluded from subsequent context.

## Release channels

| | Stable: 1.3.2 | Preview: 1.4.0-beta.3 |
| --- | --- | --- |
| Paper Q&A, citations, on-demand library lookup, history | Available | Available |
| Fold long user messages with Show more / Show less | Not included | Available |
| Review and save AI-proposed PDF annotations | Not included | Experimental |
| Get it | [Release XPI](https://github.com/kcodea516/zotero-ai-reader/releases/tag/v1.3.2) | [Source branch](https://github.com/kcodea516/zotero-ai-reader/tree/codex/annotation-agent-preview) |

The preview is available from source; the stable XPI does not contain its extra features. Follow the [build instructions](#build-from-source), switching to `codex/annotation-agent-preview` before installing dependencies.

In the preview, ask directly in chat: "Highlight the core mechanism and add comments" or "帮我圈画关键段落并加注释". No separate mode is needed. The assistant proposes up to eight text highlights or underlines with comments. It verifies original passages against local PDF coordinates, lets you inspect and select them, and writes only after you click **Save selected annotations**. Unmatched or ambiguous passages cannot be saved. **Undo this batch** moves generated annotations to Trash; edited annotations block undo so their contents are preserved. The preview supports text, not arbitrary circles, OCR, or figure interpretation. It reads at most 80 pages and 110,000 characters and discloses omitted coverage.

The preview passed native checks with a synthetic PDF and fake model responses on macOS/Zotero 10.0.6. Broader PDF layouts and provider-specific proposal quality need more testing. Its [validation record](https://github.com/kcodea516/zotero-ai-reader/blob/codex/annotation-agent-preview/VALIDATION.md) includes the scope and reproducible fixtures.

## Data and privacy

Conversations and non-secret settings stay in the plugin's directory within the Zotero profile and are not synced through Zotero. Keys use Zotero's encrypted storage and login manager. If encrypted storage is unavailable, the key remains session-only and the interface reports that limitation.

Requests go directly to your configured endpoint. Enabled reading permissions can send local paper text, including private documents, to that provider. Disable both reading permissions to send only your question, manual quotations, and completed conversation history. Provider terms and usage charges apply, including to local endpoints that forward requests elsewhere.

Extracted text is cached in memory. Saved chats contain questions, answers, reading permissions, and source metadata; automatically extracted PDF corpora are not saved with ordinary chats. The annotation preview also saves its proposed quotations and comments. Remote images in answers are not loaded automatically. The plugin does not upload your papers, keys, or conversations to this GitHub repository.

## Help and contribute

Use [GitHub Issues](https://github.com/kcodea516/zotero-ai-reader/issues/new/choose) for bugs, questions, and feature requests. Include the plugin version, Zotero version, operating system, steps to reproduce, and expected behavior. For endpoint problems, include the provider/model and whether streaming is enabled. Remove keys and private material from screenshots or logs.

Help is especially useful with Windows/Linux compatibility, different PDF layouts, endpoint behavior, accessibility, and clearer documentation. Small pull requests and reproducible reports both help. If you would like to maintain a part of the plugin over time, open an issue describing the area you want to work on. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and review expectations.

<details>
<summary>Common troubleshooting steps</summary>

- Authentication/model errors: check the endpoint, key permissions, quota, and actual model ID.
- Streaming errors: disable streaming for that endpoint and retry.
- Missing paper text: download the attachment and check that its text is selectable.
- Incomplete evidence: inspect the supplied page list and check figures and equations in the PDF.
- History save errors: check profile permissions and disk space before quitting Zotero.

</details>

## Build from source

Use Node.js 24 or newer and Python 3:

```sh
git clone https://github.com/kcodea516/zotero-ai-reader.git
cd zotero-ai-reader
# For the experimental annotation preview:
# git switch codex/annotation-agent-preview
npm ci
npm run typecheck
npm test
npm run build
```

The XPI is written to `build/`, with the version from `package.json` in its filename. Source lives in `src/`, Zotero resources in `addon/`, and tests in `tests/`. Rendering libraries and fonts ship with the package. CI runs type checks, unit tests, and the build; native fixtures are documented in [VALIDATION.md](VALIDATION.md).

Zotero AI Reader is an independent plugin under the [MIT license](LICENSE), with no affiliation to the Zotero project.
