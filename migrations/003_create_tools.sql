-- Create tools table
CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  owner_agent_id TEXT NOT NULL,
  manifest JSON NOT NULL,
  price_per_call DECIMAL(18,6) NOT NULL,
  currency TEXT DEFAULT 'USDC',
  active BOOLEAN DEFAULT true,
  total_calls INTEGER DEFAULT 0,
  total_revenue DECIMAL(18,6) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_agent_id) REFERENCES agents(id)
);

-- Create indexes for performance
CREATE INDEX idx_tools_owner ON tools(owner_agent_id);
CREATE INDEX idx_tools_name ON tools(name);
CREATE INDEX idx_tools_active ON tools(active);
CREATE INDEX idx_tools_revenue ON tools(total_revenue DESC);