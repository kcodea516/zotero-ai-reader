export interface EndpointConfig { id: string; name: string; baseURL: string; stream: boolean }
export interface ModelConfig { id: string; endpointId: string; name: string; model: string }
export interface Config { version: 1; endpoints: EndpointConfig[]; models: ModelConfig[]; defaultModelId: string; systemPrompt: string }
export interface PaperScope { libraryID: number; itemKey: string; title: string }
export interface Quote { text: string; pageLabel?: string; attachmentKey?: string }
export type MessageStatus = 'complete' | 'streaming' | 'error' | 'stopped' | 'interrupted';
export interface Message { id: string; role: 'user' | 'assistant'; content: string; createdAt: number; status: MessageStatus; requestId: string; modelName?: string; endpointName?: string; modelID?: string; quote?: Quote; error?: string }
export interface Conversation { id: string; scope: PaperScope; title: string; modelId: string; createdAt: number; updatedAt: number; messages: Message[]; draft: string; quote?: Quote }
export interface StoreState { version: 1; config: Config; conversations: Conversation[]; lastByScope: Record<string, string> }
export interface Repository { load(): Promise<StoreState | null>; save(state: StoreState): Promise<void> }
export interface SecretStore { get(endpointId: string): Promise<string>; set(endpointId: string, key: string): Promise<boolean>; delete(endpointId: string): Promise<void> }
export interface ChatRequest { endpoint: EndpointConfig; model: ModelConfig; key: string; messages: {role: 'system' | 'user' | 'assistant'; content: string}[]; signal: AbortSignal; onText(delta: string): void }
export type ChatTransport = (request: ChatRequest) => Promise<{ truncated?: boolean }>;
export interface Host { service: import('./core').ChatService; secretStore: SecretStore; rootURI: string; openSettings(win?: any): void; scopeForItem(item: any): PaperScope | null; copy(text: string): void; openURL(url: string): void }
