-- Create transaction logs table for audit trail
CREATE TABLE IF NOT EXISTS transaction_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  client_agent_id TEXT,
  tool_agent_id TEXT,
  amount DECIMAL(18,6),
  FOREIGN KEY (client_agent_id) REFERENCES agents(id),
  FOREIGN KEY (tool_agent_id) REFERENCES agents(id)
);

-- Create indexes for performance
CREATE INDEX idx_logs_task ON transaction_logs(task_id);
CREATE INDEX idx_logs_client ON transaction_logs(client_agent_id);
CREATE INDEX idx_logs_tool ON transaction_logs(tool_agent_id);
CREATE INDEX idx_logs_timestamp ON transaction_logs(timestamp DESC);
CREATE INDEX idx_logs_action ON transaction_logs(action);