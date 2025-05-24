-- Token usage tracking table
CREATE TABLE IF NOT EXISTS token_usage (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  task_id TEXT,
  request_id TEXT UNIQUE,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER NOT NULL,
  estimated_cost DECIMAL(10,6) NOT NULL,
  actual_cost DECIMAL(10,6),
  pricing_source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES agents(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- Indexes for performance
CREATE INDEX idx_token_usage_agent ON token_usage(agent_id, created_at DESC);
CREATE INDEX idx_token_usage_task ON token_usage(task_id);
CREATE INDEX idx_token_usage_created ON token_usage(created_at DESC);

-- Add token estimation columns to tasks table
ALTER TABLE tasks ADD COLUMN estimated_tokens INTEGER;
ALTER TABLE tasks ADD COLUMN estimated_cost DECIMAL(10,6);
ALTER TABLE tasks ADD COLUMN actual_tokens INTEGER;
ALTER TABLE tasks ADD COLUMN actual_cost DECIMAL(10,6);
ALTER TABLE tasks ADD COLUMN escrow_amount DECIMAL(10,6);
ALTER TABLE tasks ADD COLUMN escrow_status TEXT DEFAULT 'none';

-- Add wallet address to agents table
ALTER TABLE agents ADD COLUMN wallet_address TEXT;
ALTER TABLE agents ADD COLUMN wallet_created_at TEXT;