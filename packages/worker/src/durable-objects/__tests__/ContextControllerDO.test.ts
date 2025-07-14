import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ContextControllerDO } from '../ContextControllerDO';
import { createMockEnv, createMockDurableObjectState } from '../../test/testHelpers';
import { TranscriptChunk, TranscriptMetadata } from '../../types/transcript';

// Mock dependencies
vi.mock('../../utils/tokenCounter', () => ({
  TokenCounter: vi.fn().mockImplementation(() => ({
    count: vi.fn((text: string) => Math.ceil(text.length / 4))
  }))
}));

vi.mock('../../utils/encryption', () => ({
  EncryptionService: vi.fn().mockImplementation(() => ({
    encrypt: vi.fn().mockResolvedValue('encrypted-data'),
    decrypt: vi.fn().mockImplementation((data: string) => Promise.resolve(data))
  }))
}));

describe('ContextControllerDO', () => {
  let contextController: ContextControllerDO;
  let mockEnv: ReturnType<typeof createMockEnv>;
  let mockState: ReturnType<typeof createMockDurableObjectState>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv = createMockEnv();
    mockState = createMockDurableObjectState();
    contextController = new ContextControllerDO(mockState as any, mockEnv as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /append', () => {
    it('should create new transcript and append first message', async () => {
      const request = new Request('http://localhost/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'tenant-123',
          conversationId: 'conv-456',
          message: 'Hello, this is the first message'
        })
      });

      const response = await contextController.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toEqual({ success: true });
      
      // Verify metadata was stored
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'metadata:tenant-123:conv-456',
        expect.objectContaining({
          tenantId: 'tenant-123',
          conversationId: 'conv-456',
          chunkKeys: [],
          totalTokenCount: expect.any(Number)
        })
      );
      
      // Verify active chunk was stored
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'activeChunk:conv-456',
        expect.objectContaining({
          content: 'Hello, this is the first message',
          tokenCount: expect.any(Number)
        })
      );
    });

    it('should append to existing transcript', async () => {
      // Set up existing metadata
      const existingMetadata: TranscriptMetadata = {
        tenantId: 'tenant-123',
        conversationId: 'conv-456',
        chunkKeys: [],
        totalTokenCount: 10,
        maxTokenWindow: 32000,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };
      
      mockState.storage.get = vi.fn(async (key: string) => {
        if (key === 'metadata:tenant-123:conv-456') return existingMetadata;
        if (key === 'activeChunk:conv-456') return {
          id: 'chunk-1',
          content: 'Previous message',
          tokenCount: 10,
          timestamp: new Date().toISOString()
        };
        return null;
      });

      const request = new Request('http://localhost/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'tenant-123',
          conversationId: 'conv-456',
          message: 'Second message'
        })
      });

      const response = await contextController.fetch(request);
      
      expect(response.status).toBe(200);
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'activeChunk:conv-456',
        expect.objectContaining({
          content: 'Previous message\nSecond message'
        })
      );
    });

    it('should create new chunk when current chunk is full', async () => {
      // Set up a nearly full chunk (7999 tokens)
      mockState.storage.get = vi.fn(async (key: string) => {
        if (key === 'metadata:tenant-123:conv-456') return {
          tenantId: 'tenant-123',
          conversationId: 'conv-456',
          chunkKeys: [],
          totalTokenCount: 7999,
          maxTokenWindow: 32000,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        if (key === 'activeChunk:conv-456') return {
          id: 'chunk-1',
          content: 'x'.repeat(31996), // Simulate near-full chunk
          tokenCount: 7999,
          timestamp: new Date().toISOString()
        };
        return null;
      });

      const request = new Request('http://localhost/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'tenant-123',
          conversationId: 'conv-456',
          message: 'This message will trigger a new chunk'
        })
      });

      const response = await contextController.fetch(request);
      
      expect(response.status).toBe(200);
      
      // Should save the old chunk to R2
      expect(mockEnv.TRANSCRIPT_STORAGE.put).toHaveBeenCalled();
      
      // Should create a new active chunk
      expect(mockState.storage.put).toHaveBeenCalledWith(
        'activeChunk:conv-456',
        expect.objectContaining({
          content: 'This message will trigger a new chunk',
          tokenCount: expect.any(Number)
        })
      );
    });

    it('should handle errors gracefully', async () => {
      const request = new Request('http://localhost/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });

      const response = await contextController.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result).toHaveProperty('error');
    });
  });  describe('GET /context', () => {
    it('should return empty context for non-existent conversation', async () => {
      mockState.storage.get = vi.fn(async () => null);

      const request = new Request('http://localhost/context?tenantId=tenant-123&conversationId=conv-456');
      const response = await contextController.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toEqual({ context: '' });
    });

    it('should return context from active chunk only', async () => {
      mockState.storage.get = vi.fn(async (key: string) => {
        if (key === 'metadata:tenant-123:conv-456') return {
          tenantId: 'tenant-123',
          conversationId: 'conv-456',
          chunkKeys: [], // No saved chunks yet
          totalTokenCount: 10,
          maxTokenWindow: 32000,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        if (key === 'activeChunk:conv-456') return {
          id: 'chunk-1',
          content: 'Active conversation content',
          tokenCount: 10,
          timestamp: new Date().toISOString()
        };
        return null;
      });

      const request = new Request('http://localhost/context?tenantId=tenant-123&conversationId=conv-456');
      const response = await contextController.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toEqual({ context: 'Active conversation content' });
    });

    it('should combine chunks from R2 and active chunk', async () => {
      mockState.storage.get = vi.fn(async (key: string) => {
        if (key === 'metadata:tenant-123:conv-456') return {
          tenantId: 'tenant-123',
          conversationId: 'conv-456',
          chunkKeys: ['tenant-123/conv-456/chunk-1.json', 'tenant-123/conv-456/chunk-2.json'],
          totalTokenCount: 16000,
          maxTokenWindow: 32000,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        if (key === 'activeChunk:conv-456') return {
          id: 'chunk-3',
          content: 'Current active content',
          tokenCount: 100,
          timestamp: new Date().toISOString()
        };
        return null;
      });

      // Mock R2 responses - return the actual chunk content
      mockEnv.TRANSCRIPT_STORAGE.get = vi.fn(async (key: string) => {
        const contents: Record<string, string> = {
          'tenant-123/conv-456/chunk-1.json': 'Chunk 1 content',
          'tenant-123/conv-456/chunk-2.json': 'Chunk 2 content'
        };
        
        return {
          text: async () => contents[key] || '',
          customMetadata: {}
        } as any;
      });

      const request = new Request('http://localhost/context?tenantId=tenant-123&conversationId=conv-456');
      const response = await contextController.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.context).toContain('Chunk 1 content');
      expect(result.context).toContain('Chunk 2 content');
      expect(result.context).toContain('Current active content');
    });

    it('should return 400 for missing parameters', async () => {
      const request = new Request('http://localhost/context');
      const response = await contextController.fetch(request);

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /clear', () => {
    it('should clear all transcript data', async () => {
      mockState.storage.get = vi.fn(async (key: string) => {
        if (key === 'metadata:tenant-123:conv-456') return {
          tenantId: 'tenant-123',
          conversationId: 'conv-456',
          chunkKeys: ['tenant-123/conv-456/chunk-1.json'],
          totalTokenCount: 1000,
          maxTokenWindow: 32000,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        return null;
      });

      const request = new Request('http://localhost/clear', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'tenant-123',
          conversationId: 'conv-456'
        })
      });

      const response = await contextController.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toEqual({ success: true });
      
      // Should delete R2 objects
      expect(mockEnv.TRANSCRIPT_STORAGE.delete).toHaveBeenCalledWith('tenant-123/conv-456/chunk-1.json');
      
      // Should delete DO storage
      expect(mockState.storage.delete).toHaveBeenCalledWith('metadata:tenant-123:conv-456');
      expect(mockState.storage.delete).toHaveBeenCalledWith('activeChunk:conv-456');
    });

    it('should handle non-existent conversation gracefully', async () => {
      mockState.storage.get = vi.fn(async () => null);

      const request = new Request('http://localhost/clear', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'tenant-123',
          conversationId: 'conv-456'
        })
      });

      const response = await contextController.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result).toEqual({ success: true });
      expect(mockEnv.TRANSCRIPT_STORAGE.delete).not.toHaveBeenCalled();
    });
  });  describe('Token Management', () => {
    it('should truncate old chunks when exceeding token window', async () => {
      // Set up metadata that exceeds token window
      mockState.storage.get = vi.fn(async (key: string) => {
        if (key === 'metadata:tenant-123:conv-456') return {
          tenantId: 'tenant-123',
          conversationId: 'conv-456',
          chunkKeys: ['chunk-1', 'chunk-2', 'chunk-3'],
          totalTokenCount: 35000, // Exceeds 32000 window
          maxTokenWindow: 32000,
          createdAt: new Date().toISOString(),
          lastUpdated: new Date().toISOString()
        };
        return null;
      });

      // Mock R2 head to return token counts
      mockEnv.TRANSCRIPT_STORAGE.head = vi.fn(async () => ({
        customMetadata: { tokenCount: '10000' }
      } as any));

      const request = new Request('http://localhost/append', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: 'tenant-123',
          conversationId: 'conv-456',
          message: 'New message'
        })
      });

      await contextController.fetch(request);

      // Should delete oldest chunks
      expect(mockEnv.TRANSCRIPT_STORAGE.delete).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const request = new Request('http://localhost/unknown-route');
      const response = await contextController.fetch(request);

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('Not found');
    });

    it('should handle R2 failures gracefully', async () => {
      mockState.storage.get = vi.fn(async () => ({
        tenantId: 'tenant-123',
        conversationId: 'conv-456',
        chunkKeys: ['chunk-1'],
        totalTokenCount: 100,
        maxTokenWindow: 32000,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      }));

      mockEnv.TRANSCRIPT_STORAGE.get = vi.fn(async () => {
        throw new Error('R2 connection failed');
      });

      const request = new Request('http://localhost/context?tenantId=tenant-123&conversationId=conv-456');
      const response = await contextController.fetch(request);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result).toHaveProperty('error', 'R2 connection failed');
    });
  });
});