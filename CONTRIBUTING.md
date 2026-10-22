# Contributing to Zotero AI Reader

The project focuses on a native, simple Zotero sidebar that helps people understand papers. Contributions can be a reproducible report, a compatibility check, documentation, or code. English and Chinese issues are welcome.

## Report a problem or suggest a change

Search [existing issues](https://github.com/kcodea516/zotero-ai-reader/issues) first, then use the [issue chooser](https://github.com/kcodea516/zotero-ai-reader/issues/new/choose). Describe one problem per issue. Include the plugin/Zotero versions, operating system, reproduction steps, expected result, and actual result. For model failures, include the provider, model ID, streaming setting, and a redacted error message.

A small public PDF or synthetic example helps with extraction and annotation problems. Do not attach API keys, private conversations, or documents you cannot share. Feature requests should start with the reading task that is difficult today.

## Places to help

- Test a release on Windows or Linux and record the exact environment and result.
- Reproduce an issue with a public or synthetic PDF.
- Check keyboard navigation, narrow sidebars, dark mode, and interface labels.
- Improve explanations, setup steps, or screenshots using sample data.
- Work on text extraction, citation navigation, endpoint compatibility, or annotation positioning.

If you want to help maintain an area over time, open a feature/question issue describing that area and your proposed first task. Repository access is discussed separately; a first contribution can be an ordinary issue or pull request.

## Development setup

Use Node.js 24 or newer and Python 3. Fork the repository, clone your fork, and create a branch for the change. General fixes target `main`; experimental annotation changes target `codex/annotation-agent-preview` while that work remains in preview.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Install the resulting XPI from `build/` in Zotero through **Tools → Plugins → Install Plugin From File**. Keep development documents and model credentials separate from your daily library. The installed plugin does not need Node.js.

`src/` contains the service, sidebar, settings, and Zotero adapters. `addon/` contains the manifest, native resources, and CSS. `tests/` contains unit tests and native integration fixtures. `scripts/` builds packages and fixture bundles.

## Check the change

Run checks appropriate to the change and report what you ran. Documentation-only edits do not require a fresh native test session. Runtime changes should pass the commands above. For sidebar/settings changes, also check the affected native UI in Zotero at a narrow sidebar width. `npm run build:smoke` builds the native fixtures; [VALIDATION.md](VALIDATION.md) explains how to run them.

Use fake transports for repeatable UI tests. Tests should not require a real API key or consume provider credits. Annotation tests must use a disposable public or synthetic PDF, preserve existing annotations, and clean up the test data. Preserve unsent drafts when working on rendering, navigation, language, or model selection.

If you cannot run a platform-specific check, say so in the pull request. Distinguish a simulated model response from a live provider test and a source review from a native runtime check.

## Submit a pull request

Keep the change focused. Explain the user-visible problem, resulting behavior, and validation. Include a redacted screenshot for a UI change when it helps the review. Update both English and Chinese interface strings, and update documentation when behavior changes. Use English commit messages and pull request descriptions.

For a larger change, discuss it in an issue before spending time on implementation. Review and response times depend on maintainer availability; opening a pull request does not imply a release date.

The project uses the [MIT license](LICENSE).
