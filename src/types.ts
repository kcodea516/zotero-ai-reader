export interface EndpointConfig { id: string; name: string; baseURL: string; stream: boolean }
export interface ModelConfig { id: string; endpointId: string; name: string; model: string }
export interface Config { version: 1; language?: import('./i18n.ts').UILanguage; endpoints: EndpointConfig[]; models: ModelConfig[]; defaultModelId: string; systemPrompt: string; appearance?: { userMessageColor: string } }
export interface PaperScope { libraryID: number; itemKey: string; title: string }
export interface ReadingOptions { currentPaper: boolean; relatedPapers: boolean }
export interface PaperSource { id: string; title: string; libraryID: number; itemKey: string; attachmentKey: string; pages: number[]; totalPages: number; truncated: boolean }
export interface PaperContext { text: string; sources: PaperSource[]; warning?: string }
export interface PaperContextRequest { language?: import('./i18n.ts').UILanguage; scope: PaperScope; question: string; previousQuestions: string[]; options: ReadingOptions; signal: AbortSignal }
export type PaperContextProvider = (request: PaperContextRequest) => Promise<PaperContext>;
export interface Quote { text: string; pageLabel?: string; attachmentKey?: string }
export type MessageStatus = 'complete' | 'streaming' | 'error' | 'stopped' | 'interrupted';
export interface Message { intent?: 'annotate'; annotationPlan?: import('./annotations.ts').AnnotationPlan; id: string; role: 'user' | 'assistant'; content: string; createdAt: number; status: MessageStatus; requestId: string; modelName?: string; endpointName?: string; modelID?: string; quote?: Quote; error?: string; sources?: PaperSource[]; contextNotice?: string }
export interface Conversation { id: string; scope: PaperScope; title: string; modelId: string; createdAt: number; updatedAt: number; messages: Message[]; draft: string; quote?: Quote; readingOptions?: ReadingOptions }
export interface StoreState { version: 1; config: Config; conversations: Conversation[]; lastByScope: Record<string, string> }
export interface Repository { load(): Promise<StoreState | null>; save(state: StoreState): Promise<void> }
export interface SecretStore { get(endpointId: string): Promise<string>; set(endpointId: string, key: string): Promise<boolean>; delete(endpointId: string): Promise<void> }
export interface ChatRequest { endpoint: EndpointConfig; model: ModelConfig; key: string; messages: {role: 'system' | 'user' | 'assistant'; content: string}[]; signal: AbortSignal; onText(delta: string): void }
export type ChatTransport = (request: ChatRequest) => Promise<{ truncated?: boolean }>;
export interface Host { service: import('./core').ChatService; secretStore: SecretStore; rootURI: string; openSettings(win?: any): void; scopeForItem(item: any): PaperScope | null; copy(text: string): void; openURL(url: string): void; openSource?(source: PaperSource, page?: number): void; annotations?: import('./annotations.ts').AnnotationTools }
