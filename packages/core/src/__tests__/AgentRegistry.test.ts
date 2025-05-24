import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRegistry } from '../registry/AgentRegistry';
import { Env } from '../types/env';

// Mock environment
function createMockEnv(): Env {
  const mockResults: any[] = [];
  
  return {
    MARKETPLACE_DB: {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({}),
      first: vi.fn().mockImplementation(() => 
        mockResults.length > 0 ? mockResults[0] : null
      ),
      all: vi.fn().mockResolvedValue({ results: mockResults })
    } as any,
    AGENT_STATE: {
      idFromString: vi.fn((id: string) => ({ toString: () => id })),
      get: vi.fn().mockReturnValue({
        fetch: vi.fn().mockResolvedValue(new Response('{"success": true}'))
      })
    } as any,
    TRANSACTION_ORCHESTRATOR: {} as any,
    TOOL_REGISTRY: {} as any,
    RATE_LIMITER: {} as any,
    KV_CACHE: {} as any,
    API_BASE_URL: 'http://localhost:8787',
    PLATFORM_FEE_PERCENT: '2.5',
    USDC_CONTRACT_ADDRESS: '0x...',
    CIRCLE_API_KEY: 'test_key'
  };
}

describe('AgentRegistry', () => {
  let registry: AgentRegistry;
  let env: Env;

  beforeEach(() => {
    env = createMockEnv();
    registry = new AgentRegistry(env);
  });

  describe('createAgent', () => {
    it('should create a new agent with API key', async () => {
      const result = await registry.createAgent({
        name: 'Test Agent',
        ownerId: 'user-123',
        description: 'A test agent',
        tags: ['test', 'demo']
      });

      expect(result.agent.name).toBe('Test Agent');
      expect(result.agent.ownerId).toBe('user-123');
      expect(result.agent.reputationScore).toBe(5.0);
      expect(result.apiKey).toBeDefined();
      expect(result.apiKey).toMatch(/^sk_live_[a-f0-9]{64}$/);
    });

    it('should store agent in database', async () => {
      await registry.createAgent({
        name: 'Test Agent',
        ownerId: 'user-123'
      });

      expect(env.MARKETPLACE_DB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agents')
      );
      expect(env.MARKETPLACE_DB.bind).toHaveBeenCalled();
      expect(env.MARKETPLACE_DB.run).toHaveBeenCalled();
    });

    it('should create AgentState Durable Object', async () => {
      await registry.createAgent({
        name: 'Test Agent',
        ownerId: 'user-123'
      });

      expect(env.AGENT_STATE.idFromString).toHaveBeenCalled();
      expect(env.AGENT_STATE.get).toHaveBeenCalled();
    });
  });

  describe('getAgent', () => {
    it('should return agent when found', async () => {
      const mockAgent = {
        id: 'agent-123',
        name: 'Test Agent',
        owner_id: 'user-123',
        reputation_score: 5.0,
        created_at: new Date().toISOString()
      };

      (env.MARKETPLACE_DB.first as any).mockResolvedValue(mockAgent);

      const agent = await registry.getAgent('agent-123');

      expect(agent).toBeDefined();
      expect(agent?.id).toBe('agent-123');
      expect(agent?.name).toBe('Test Agent');
      expect(agent?.reputationScore).toBe(5.0);
    });

    it('should return null when agent not found', async () => {
      (env.MARKETPLACE_DB.first as any).mockResolvedValue(null);

      const agent = await registry.getAgent('non-existent');

      expect(agent).toBeNull();
    });
  });

  describe('validateApiKey', () => {
    it('should validate API key and return agent', async () => {
      const mockAgent = {
        id: 'agent-123',
        name: 'Test Agent',
        owner_id: 'user-123',
        reputation_score: 5.0,
        created_at: new Date().toISOString()
      };

      (env.MARKETPLACE_DB.first as any).mockResolvedValue(mockAgent);

      const agent = await registry.validateApiKey('sk_live_test123');

      expect(agent).toBeDefined();
      expect(agent?.id).toBe('agent-123');
    });

    it('should return null for invalid API key', async () => {
      (env.MARKETPLACE_DB.first as any).mockResolvedValue(null);

      const agent = await registry.validateApiKey('invalid-key');

      expect(agent).toBeNull();
    });
  });

  describe('updateAgentReputation', () => {
    it('should update agent reputation score', async () => {
      await registry.updateAgentReputation('agent-123', 7.5);

      expect(env.MARKETPLACE_DB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE agents')
      );
      expect(env.MARKETPLACE_DB.bind).toHaveBeenCalledWith(
        7.5,
        expect.any(String),
        'agent-123'
      );
    });

    it('should clamp reputation score between 0 and 10', async () => {
      await registry.updateAgentReputation('agent-123', 15);

      expect(env.MARKETPLACE_DB.bind).toHaveBeenCalledWith(
        10, // Clamped to max
        expect.any(String),
        'agent-123'
      );

      await registry.updateAgentReputation('agent-123', -5);

      expect(env.MARKETPLACE_DB.bind).toHaveBeenCalledWith(
        0, // Clamped to min
        expect.any(String),
        'agent-123'
      );
    });
  });

  describe('listAgents', () => {
    it('should list agents with pagination', async () => {
      const mockAgents = [
        {
          id: 'agent-1',
          name: 'Agent 1',
          owner_id: 'user-1',
          reputation_score: 5.0,
          created_at: new Date().toISOString()
        },
        {
          id: 'agent-2',
          name: 'Agent 2',
          owner_id: 'user-2',
          reputation_score: 7.0,
          created_at: new Date().toISOString()
        }
      ];

      (env.MARKETPLACE_DB.all as any).mockResolvedValue({ results: mockAgents });
      (env.MARKETPLACE_DB.first as any).mockResolvedValue({ total: 2 });

      const result = await registry.listAgents({
        limit: 10,
        offset: 0
      });

      expect(result.agents).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.agents[0].name).toBe('Agent 1');
    });

    it('should filter agents by search term', async () => {
      await registry.listAgents({
        search: 'test',
        limit: 10,
        offset: 0
      });

      expect(env.MARKETPLACE_DB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('name LIKE ?')
      );
      expect(env.MARKETPLACE_DB.bind).toHaveBeenCalledWith(
        '%test%',
        '%test%',
        10,
        0
      );
    });
  });
});