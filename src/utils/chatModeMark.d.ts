export type ChatSendMode = 'auto' | 'plan' | 'chat';

export function appendModeMark(content: string, mode: ChatSendMode): string;

export function parseModeMark(content: string): { text: string; mode: ChatSendMode | null };
