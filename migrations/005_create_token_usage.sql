-- Create token usage table for tracking costs
CREATE TABLE IF NOT EXISTS token_usage (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
  total_cost DECIMAL(10,6) NOT NULL,
  task_id TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Create indexes for performance
CREATE INDEX idx_token_usage_agent ON token_usage(agent_id);
CREATE INDEX idx_token_usage_model ON token_usage(model);
CREATE INDEX idx_token_usage_timestamp ON token_usage(timestamp DESC);
CREATE INDEX idx_token_usage_task ON token_usage(task_id);

-- Create aggregated view for daily usage
CREATE VIEW IF NOT EXISTS daily_token_usage AS
SELECT 
  agent_id,
  model,
  DATE(timestamp) as usage_date,
  SUM(prompt_tokens) as total_prompt_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost) as total_cost,
  COUNT(*) as request_count
FROM token_usage
GROUP BY agent_id, model, DATE(timestamp);