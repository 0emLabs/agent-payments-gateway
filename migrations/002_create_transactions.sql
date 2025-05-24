-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  from_agent_id TEXT NOT NULL,
  to_agent_id TEXT NOT NULL,
  amount DECIMAL(18,6) NOT NULL,
  currency TEXT DEFAULT 'USDC',
  status TEXT NOT NULL CHECK (status IN ('pending', 'escrowed', 'completed', 'failed', 'cancelled')),
  task_id TEXT,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  FOREIGN KEY (from_agent_id) REFERENCES agents(id),
  FOREIGN KEY (to_agent_id) REFERENCES agents(id)
);

-- Create indexes for performance
CREATE INDEX idx_transactions_from ON transactions(from_agent_id);
CREATE INDEX idx_transactions_to ON transactions(to_agent_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_task ON transactions(task_id);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);