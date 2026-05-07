export class ChatResponseDto {
  reply!: string;
  conversationId!: string;
  usage!: { inputTokens: number; outputTokens: number };
}
