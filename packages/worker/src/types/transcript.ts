export interface TranscriptChunk {
  id: string;
  content: string;
  tokenCount: number;
  timestamp: string;
}

export interface TranscriptMetadata {
  tenantId: string;
  conversationId: string;
  chunkKeys: string[]; // R2 object keys
  totalTokenCount: number;
  maxTokenWindow: number;
  createdAt: string;
  lastUpdated: string;
}