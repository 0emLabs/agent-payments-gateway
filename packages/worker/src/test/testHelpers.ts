import { vi } from 'vitest';
import { Env } from '../types/env';

// Mock environment factory
export function createMockEnv(overrides?: Partial<Env>): Env {
  return {
    // KV Namespaces
    TOOL_CACHE: createMockKVNamespace(),
    AUTH_STORE: createMockKVNamespace(),
    STATE_STORE: createMockKVNamespace(),
    
    // R2 Storage
    TRANSCRIPT_STORAGE: createMockR2Bucket(),
    
    // D1 Database
    METADATA_DB: createMockD1Database(),
    
    // Durable Object bindings
    PARENT_ORCHESTRATOR: createMockDurableObjectNamespace(),
    CONTEXT_CONTROLLER: createMockDurableObjectNamespace(),
    RATE_LIMITER: createMockDurableObjectNamespace(),
    
    // Queue bindings
    TASK_QUEUE: createMockQueue(),
    
    // Environment variables
    SLACK_SIGNING_SECRET: 'test-slack-secret',
    SLACK_OAUTH_CLIENT_ID: 'test-client-id',
    SLACK_OAUTH_CLIENT_SECRET: 'test-client-secret',
    FRONTEND_APP_URL: 'https://test.pages.dev',
    WORKER_URL: 'https://test.workers.dev',
    
    // Secrets
    MCP_AUTH_SECRET: 'test-mcp-secret',
    JWT_SIGNING_KEY: 'test-jwt-key',
    TENANT_ENCRYPTION_KEYS: 'test-encryption-keys',
    
    ...overrides
  };
}

// Mock KV Namespace
export function createMockKVNamespace(): KVNamespace {
  const store = new Map<string, string>();
  
  return {
    get: vi.fn(async (key: string) => store.get(key) || null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({
      keys: Array.from(store.keys()).map(name => ({ name })),
      list_complete: true,
      cursor: undefined
    }))
  } as any;
}

// Mock R2 Bucket
export function createMockR2Bucket(): R2Bucket {
  const store = new Map<string, { body: string; metadata?: Record<string, string> }>();
  
  return {
    get: vi.fn(async (key: string) => {
      const item = store.get(key);
      if (!item) return null;
      
      return {
        body: item.body,
        customMetadata: item.metadata,
        text: async () => item.body,
        json: async () => JSON.parse(item.body)
      } as any;
    }),
    put: vi.fn(async (key: string, value: string, options?: any) => {
      store.set(key, { body: value, metadata: options?.metadata });
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    head: vi.fn(async (key: string) => {
      const item = store.get(key);
      if (!item) return null;
      
      return {
        customMetadata: item.metadata,
        size: item.body.length
      } as any;
    })
  } as any;
}// Mock D1 Database
export function createMockD1Database(): D1Database {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn(async () => ({ results: [] })),
      first: vi.fn(async () => null),
      run: vi.fn(async () => ({ success: true }))
    })),
    batch: vi.fn(async () => []),
    exec: vi.fn(async () => ({ results: [] }))
  } as any;
}

// Mock Durable Object Namespace
export function createMockDurableObjectNamespace(): DurableObjectNamespace {
  const stubs = new Map<string, any>();
  
  return {
    idFromName: vi.fn((name: string) => ({ toString: () => `id-${name}` })),
    idFromString: vi.fn((id: string) => ({ toString: () => id })),
    get: vi.fn((id: any) => {
      const idStr = id.toString();
      if (!stubs.has(idStr)) {
        stubs.set(idStr, createMockDurableObjectStub(idStr));
      }
      return stubs.get(idStr);
    })
  } as any;
}

// Mock Durable Object Stub
export function createMockDurableObjectStub(id: string): any {
  return {
    id,
    fetch: vi.fn(async (request: Request) => {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }),
    // Add custom methods for specific DOs
    checkAndIncrement: vi.fn(async () => true),
    startTask: vi.fn(async () => {}),
    reportSubTaskResult: vi.fn(async () => {})
  };
}

// Mock Queue
export function createMockQueue(): Queue {
  const messages: any[] = [];
  
  return {
    send: vi.fn(async (message: any) => {
      messages.push(message);
    }),
    // For testing, expose messages
    _getMessages: () => messages,
    _clear: () => messages.length = 0
  } as any;
}

// Mock Durable Object State
export function createMockDurableObjectState(): DurableObjectState {
  const storage = new Map<string, any>();
  
  return {
    id: { toString: () => 'test-do-id' },
    storage: {
      get: vi.fn(async (key: string) => storage.get(key)),
      put: vi.fn(async (key: string, value: any) => {
        storage.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        storage.delete(key);
      }),
      deleteAll: vi.fn(async () => {
        storage.clear();
      }),
      setAlarm: vi.fn(async () => {})
    }
  } as any;
}

// Slack test helpers
export function createMockSlackRequest(payload: any): Request {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = new URLSearchParams(payload).toString();
  
  return new Request('https://test.workers.dev/slack/commands', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-slack-request-timestamp': timestamp,
      'x-slack-signature': 'v0=mock-signature'
    },
    body
  });
}

// Create mock slack interaction payload
export function createMockSlackInteraction(type: string, action?: any): Request {
  const payload = {
    type,
    user: { id: 'U123456' },
    channel: { id: 'C123456' },
    response_url: 'https://hooks.slack.com/response',
    actions: action ? [action] : []
  };
  
  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  
  return new Request('https://test.workers.dev/slack/interactions', {
    method: 'POST',
    body: formData
  });
}