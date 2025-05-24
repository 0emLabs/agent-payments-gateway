-- Migration: Add wallet and session key tables
-- Date: 2025-01-25

-- Smart wallets table
CREATE TABLE IF NOT EXISTS wallets (
  wallet_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('eoa', 'smart', 'delegated')),
  created_at TEXT NOT NULL,
  updated_at TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Session keys table
CREATE TABLE IF NOT EXISTS session_keys (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  address TEXT NOT NULL,
  spend_limit TEXT NOT NULL,
  valid_from INTEGER NOT NULL,
  valid_until INTEGER NOT NULL,
  allowed_contracts TEXT, -- JSON array of addresses
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (wallet_id) REFERENCES wallets(wallet_id)
);

-- Wallet transactions table
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  to_address TEXT NOT NULL,
  value TEXT NOT NULL,
  token TEXT DEFAULT 'usdc',
  gas_used TEXT,
  status TEXT DEFAULT 'pending',
  session_key_id TEXT,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (wallet_id) REFERENCES wallets(wallet_id),
  FOREIGN KEY (session_key_id) REFERENCES session_keys(id)
);

-- Wallet balances table (for caching)
CREATE TABLE IF NOT EXISTS wallet_balances (
  wallet_address TEXT PRIMARY KEY,
  native_balance TEXT DEFAULT '0',
  usdc_balance TEXT DEFAULT '0',
  last_updated TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallets_agent_id ON wallets(agent_id);
CREATE INDEX IF NOT EXISTS idx_session_keys_wallet_id ON session_keys(wallet_id);
CREATE INDEX IF NOT EXISTS idx_session_keys_active ON session_keys(is_active, valid_until);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_timestamp ON wallet_transactions(timestamp);