import { Env } from '../types/env';
import { TranscriptChunk, TranscriptMetadata } from '../types/transcript';
import { TokenCounter } from '../utils/tokenCounter';
import { EncryptionService } from '../utils/encryption';

export class ContextControllerDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private tokenCounter: TokenCounter;
  private encryptionService: EncryptionService;
  
  // Constants
  private readonly CHUNK_SIZE_TOKENS = 8000;
  private readonly MAX_WINDOW_TOKENS = 32000;
  
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.tokenCounter = new TokenCounter();
    this.encryptionService = new EncryptionService(env);
  }
  
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    
    switch (`${method} ${url.pathname}`) {
      case 'POST /append':
        return this.handleAppend(request);
      case 'GET /context':
        return this.handleGetContext(request);
      case 'DELETE /clear':
        return this.handleClear(request);
      default:
        return new Response('Not found', { status: 404 });
    }
  }  private async handleAppend(request: Request): Promise<Response> {
    try {
      const { tenantId, conversationId, message } = await request.json() as {
        tenantId: string;
        conversationId: string;
        message: string;
      };
      
      // Get or initialize metadata
      const metadataKey = `metadata:${tenantId}:${conversationId}`;
      let metadata = await this.state.storage.get<TranscriptMetadata>(metadataKey);
      
      if (!metadata) {
        metadata = {
          tenantId,
          conversationId,
          chunkKeys: [],
          totalTokenCount: 0,
          maxTokenWindow: this.MAX_WINDOW_TOKENS,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
      }
      
      // Count tokens in the new message
      const messageTokens = this.tokenCounter.count(message);
      
      // Get current active chunk or create new one
      let activeChunk = await this.getActiveChunk(metadata);
      
      // Check if we need a new chunk
      if (!activeChunk || activeChunk.tokenCount + messageTokens > this.CHUNK_SIZE_TOKENS) {
        // Save current chunk if exists
        if (activeChunk) {
          await this.saveChunk(metadata, activeChunk);
        }
        
        // Create new chunk
        activeChunk = {
          id: crypto.randomUUID(),
          content: message,
          tokenCount: messageTokens,
          timestamp: new Date().toISOString()
        };
      } else {
        // Append to existing chunk
        activeChunk.content += '\n' + message;
        activeChunk.tokenCount += messageTokens;
      }
      
      // Update metadata
      metadata.totalTokenCount += messageTokens;
      metadata.lastUpdated = new Date().toISOString();
      
      // Store active chunk in DO storage
      await this.state.storage.put(`activeChunk:${conversationId}`, activeChunk);
      
      // Perform truncation if needed
      await this.truncateOldChunks(metadata);
      
      // Save metadata
      await this.state.storage.put(metadataKey, metadata);
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }  private async handleGetContext(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const tenantId = url.searchParams.get('tenantId');
      const conversationId = url.searchParams.get('conversationId');
      
      if (!tenantId || !conversationId) {
        return new Response('Missing parameters', { status: 400 });
      }
      
      const metadataKey = `metadata:${tenantId}:${conversationId}`;
      const metadata = await this.state.storage.get<TranscriptMetadata>(metadataKey);
      
      if (!metadata) {
        return new Response(JSON.stringify({ context: '' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Fetch all chunks from R2
      const chunks: string[] = [];
      
      for (const chunkKey of metadata.chunkKeys) {
        const r2Object = await this.env.TRANSCRIPT_STORAGE.get(chunkKey);
        if (r2Object) {
          const encryptedData = await r2Object.text();
          const decryptedData = await this.encryptionService.decrypt(encryptedData, tenantId);
          chunks.push(decryptedData);
        }
      }
      
      // Get active chunk if exists
      const activeChunk = await this.state.storage.get<TranscriptChunk>(`activeChunk:${conversationId}`);
      if (activeChunk) {
        chunks.push(activeChunk.content);
      }
      
      const fullContext = chunks.join('\n');
      
      return new Response(JSON.stringify({ context: fullContext }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }  private async handleClear(request: Request): Promise<Response> {
    try {
      const { tenantId, conversationId } = await request.json() as {
        tenantId: string;
        conversationId: string;
      };
      
      const metadataKey = `metadata:${tenantId}:${conversationId}`;
      const metadata = await this.state.storage.get<TranscriptMetadata>(metadataKey);
      
      if (metadata) {
        // Delete all chunks from R2
        for (const chunkKey of metadata.chunkKeys) {
          await this.env.TRANSCRIPT_STORAGE.delete(chunkKey);
        }
      }
      
      // Clear DO storage
      await this.state.storage.delete(metadataKey);
      await this.state.storage.delete(`activeChunk:${conversationId}`);
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }  private async getActiveChunk(metadata: TranscriptMetadata): Promise<TranscriptChunk | null> {
    return await this.state.storage.get<TranscriptChunk>(`activeChunk:${metadata.conversationId}`);
  }
  
  private async saveChunk(metadata: TranscriptMetadata, chunk: TranscriptChunk): Promise<void> {
    const chunkKey = `${metadata.tenantId}/${metadata.conversationId}/${chunk.id}.json`;
    
    // Encrypt chunk data
    const encryptedData = await this.encryptionService.encrypt(chunk.content, metadata.tenantId);
    
    // Save to R2
    await this.env.TRANSCRIPT_STORAGE.put(chunkKey, encryptedData, {
      metadata: {
        tenantId: metadata.tenantId,
        conversationId: metadata.conversationId,
        tokenCount: chunk.tokenCount.toString(),
        timestamp: chunk.timestamp
      }
    });
    
    // Add chunk key to metadata
    metadata.chunkKeys.push(chunkKey);
  }
  
  private async truncateOldChunks(metadata: TranscriptMetadata): Promise<void> {
    while (metadata.totalTokenCount > metadata.maxTokenWindow && metadata.chunkKeys.length > 0) {
      const oldestChunkKey = metadata.chunkKeys.shift()!;
      
      // Get chunk info to subtract tokens
      const r2Object = await this.env.TRANSCRIPT_STORAGE.head(oldestChunkKey);
      if (r2Object?.customMetadata?.tokenCount) {
        metadata.totalTokenCount -= parseInt(r2Object.customMetadata.tokenCount);
      }
      
      // Delete from R2
      await this.env.TRANSCRIPT_STORAGE.delete(oldestChunkKey);
    }
  }
}