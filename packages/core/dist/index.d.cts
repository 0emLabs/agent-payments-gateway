import { Hono } from 'hono';

interface Env {
    MARKETPLACE_DB: D1Database;
    AGENT_STATE: DurableObjectNamespace;
    TRANSACTION_ORCHESTRATOR: DurableObjectNamespace;
    TOOL_REGISTRY: DurableObjectNamespace;
    RATE_LIMITER: DurableObjectNamespace;
    KV_CACHE: KVNamespace;
    API_BASE_URL: string;
    PLATFORM_FEE_PERCENT: string;
    USDC_CONTRACT_ADDRESS: string;
    CIRCLE_API_KEY: string;
    R2_BUCKET?: R2Bucket;
    PARENT_ORCHESTRATOR?: DurableObjectNamespace;
    CONTEXT_CONTROLLER?: DurableObjectNamespace;
    TASK_QUEUE?: Queue;
    SLACK_SIGNING_SECRET?: string;
    JWT_SIGNING_KEY?: string;
    TENANT_ENCRYPTION_KEYS?: string;
    MCP_AUTH_SECRET?: string;
    PLATFORM_FEE_WALLET?: string;
    [key: string]: any;
}

interface Agent {
    id: string;
    name: string;
    ownerId: string;
    reputationScore: number;
    createdAt: Date;
}
interface CreateAgentParams {
    name: string;
    ownerId: string;
    description?: string;
    tags?: string[];
}
interface CreateAgentResponse {
    agent: Agent;
    apiKey: string;
}
interface AgentWallet {
    address: string;
    balance: string;
    currency: 'USDC';
}
interface AgentIdentity extends Agent {
    api_key: string;
    description?: string;
    tags: string[];
    wallet: AgentWallet;
    last_active: string;
    status: 'active' | 'inactive' | 'suspended';
}

type TaskStatus$1 = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
interface Task$1 {
    id: string;
    fromAgentId: string;
    toAgentId: string;
    status: TaskStatus$1;
    payload: unknown;
    payment: {
        amount: string;
        currency: 'USDC';
    };
    createdAt: Date;
    expiresAt: Date;
    completedAt?: Date;
}
interface CreateTaskParams$1 {
    fromAgentId: string;
    toAgentId: string;
    payload: unknown;
    payment: {
        amount: string;
        currency: 'USDC';
    };
}
interface TaskRequest {
    id: string;
    client_agent_id: string;
    tool_agent_id: string;
    task_details: unknown;
    payment_offer: {
        amount: string;
        currency: string;
    };
    status: string;
    created_at: string;
    expires_at: string;
    completed_at?: string;
}

declare class AgentRegistry {
    private env;
    constructor(env: Env);
    createAgent(params: CreateAgentParams): Promise<CreateAgentResponse>;
    getAgent(agentId: string): Promise<Agent | null>;
    validateApiKey(apiKey: string): Promise<Agent | null>;
    updateAgentReputation(agentId: string, newScore: number): Promise<void>;
    listAgents(params: {
        limit?: number;
        offset?: number;
        search?: string;
        tags?: string[];
    }): Promise<{
        agents: Agent[];
        total: number;
    }>;
}

type TaskStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
interface Task {
    id: string;
    fromAgentId: string;
    toAgentId: string;
    status: TaskStatus;
    payload: any;
    payment: {
        amount: string;
        currency: 'USDC';
    };
    createdAt: Date;
    expiresAt: Date;
    completedAt?: Date;
}
interface CreateTaskParams {
    fromAgentId: string;
    toAgentId: string;
    toolAgentId: string;
    payload: any;
    payment: {
        amount: string;
        currency: 'USDC';
    };
}

declare class TaskOrchestrator {
    private env;
    constructor(env: Env);
    createTask(params: CreateTaskParams): Promise<Task>;
    getTaskStatus(taskId: string): Promise<Task | null>;
    acceptTask(taskId: string, toolAgentId: string): Promise<void>;
    completeTask(taskId: string, toolAgentId: string, result?: unknown): Promise<void>;
    cancelTask(taskId: string, clientAgentId: string, reason?: string): Promise<void>;
    getAgentTasks(agentId: string, role?: 'client' | 'tool'): Promise<Task[]>;
}

/**
 * Generate a secure API key
 */
declare function generateApiKey(): string;
/**
 * Hash an API key for secure storage
 */
declare function hashApiKey(apiKey: string): Promise<string>;
/**
 * Generate a unique task ID
 */
declare function generateTaskId(): string;
/**
 * Generate a unique transaction ID
 */
declare function generateTransactionId(): string;
/**
 * Verify a webhook signature
 */
declare function verifyWebhookSignature(body: string, signature: string, secret: string): Promise<boolean>;

declare function createApp(): Hono<{
    Bindings: Env;
}, {}, "/">;

export { type Agent, type AgentIdentity, AgentRegistry, type AgentWallet, type CreateAgentParams, type CreateAgentResponse, type CreateTaskParams$1 as CreateTaskParams, type Env, type Task$1 as Task, TaskOrchestrator, type TaskRequest, type TaskStatus$1 as TaskStatus, createApp, generateApiKey, generateTaskId, generateTransactionId, hashApiKey, verifyWebhookSignature };
