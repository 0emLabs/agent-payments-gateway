# Batch Transactions with Spending Caps

This document explains the implementation of batch transactions with spending caps for the Privy wallet system.

## Overview

The batch transaction feature allows users to execute multiple transactions atomically while respecting preset spending limits. This ensures both convenience and security for users managing multiple payments.

## Features

### 1. Spending Cap Management
- **Per-token spending limits**: Set different spending caps for ETH and ERC20 tokens
- **24-hour reset period**: Spending caps reset every 24 hours
- **Real-time tracking**: View current spending and available balance
- **Self-managed**: Users can set their own spending caps

### 2. Batch Transaction Execution
- **Atomic execution**: All transactions succeed or fail together
- **Signature verification**: Each batch requires user signature for security
- **Spending cap validation**: Transactions are validated against available spending limits
- **Gas optimization**: Reduced gas costs compared to individual transactions
- **Transaction limits**: Maximum 50 transactions per batch

### 3. Security Features
- **Nonce-based replay protection**: Prevents transaction replay attacks
- **Deadline enforcement**: Transactions expire after specified time
- **Access control**: Only authorized users can execute transactions
- **Input validation**: Comprehensive validation of all transaction parameters

## Smart Contract Architecture

### BatchWallet Contract

The `BatchWallet` contract is the core component that handles batch transactions and spending cap management.

#### Key Functions

```solidity
// Set spending cap for the caller
function setMySpendingCap(address token, uint256 amount) external

// Execute a batch of transactions
function executeBatchTransaction(
    BatchTransaction calldata batchTx,
    bytes calldata signature
) external

// Get current nonce for a user
function getCurrentNonce(address user) external view returns (uint256)

// Get available spending for a user and token
function getAvailableSpending(address user, address token) external view returns (uint256)
```

#### Data Structures

```solidity
struct Transaction {
    address to;      // Recipient address
    uint256 value;   // Amount to transfer
    bytes data;      // Optional contract call data
    address token;   // Token address (address(0) for ETH)
}

struct BatchTransaction {
    Transaction[] transactions;
    uint256 nonce;
    uint256 deadline;
}
```

## API Endpoints

### 1. Batch Transaction Execution

**POST** `/api/ethereum/batch_transaction`

Execute a batch of transactions.

#### Request Body
```json
{
  "walletId": "string",
  "transactions": [
    {
      "to": "0x...",
      "value": "amount_in_wei",
      "data": "0x...",
      "token": "0x..." // optional, defaults to ETH
    }
  ],
  "deadline": 1234567890 // optional, unix timestamp
}
```

#### Response
```json
{
  "success": true,
  "transactionHash": "0x...",
  "batchSize": 2,
  "nonce": "123",
  "deadline": 1234567890,
  "contractAddress": "0x..."
}
```

### 2. Spending Cap Management

**GET** `/api/ethereum/spending_cap?walletId=...&token=...`

Get spending cap information for a wallet and token.

#### Response
```json
{
  "walletId": "string",
  "userAddress": "0x...",
  "token": "0x...",
  "spendingCap": "1000000000000000000",
  "usedSpending": "500000000000000000",
  "availableSpending": "500000000000000000",
  "tokenType": "ETH"
}
```

**POST** `/api/ethereum/spending_cap`

Set a new spending cap.

#### Request Body
```json
{
  "walletId": "string",
  "token": "0x...",
  "amount": "1000000000000000000"
}
```

## Frontend Integration

### BatchTransactionManager Component

The `BatchTransactionManager` React component provides a user-friendly interface for:

1. **Setting spending caps** for different tokens
2. **Creating batch transactions** with multiple recipients
3. **Monitoring spending limits** and available balances
4. **Executing batch transactions** with real-time feedback

#### Key Features
- Token selection dropdown (ETH, USDC, etc.)
- Dynamic transaction list with add/remove capabilities
- Real-time spending cap information display
- Input validation and error handling
- Transaction status feedback

## Usage Examples

### 1. Setting a Spending Cap

```typescript
// Set a 1 ETH spending cap
await axios.post('/api/ethereum/spending_cap', {
  walletId: 'wallet-id',
  token: '0x0000000000000000000000000000000000000000', // ETH
  amount: '1000000000000000000' // 1 ETH in wei
});
```

### 2. Creating a Batch Transaction

```typescript
// Execute batch transaction with 2 transfers
await axios.post('/api/ethereum/batch_transaction', {
  walletId: 'wallet-id',
  transactions: [
    {
      to: '0x1234...',
      value: '100000000000000000', // 0.1 ETH
      token: '0x0000000000000000000000000000000000000000'
    },
    {
      to: '0x5678...',
      value: '200000000000000000', // 0.2 ETH
      token: '0x0000000000000000000000000000000000000000'
    }
  ]
});
```

### 3. Checking Available Spending

```typescript
// Check available spending for ETH
const response = await axios.get('/api/ethereum/spending_cap', {
  params: {
    walletId: 'wallet-id',
    token: '0x0000000000000000000000000000000000000000'
  }
});

console.log('Available spending:', response.data.availableSpending);
```

## Security Considerations

### 1. Signature Verification
- Each batch transaction requires a valid signature from the wallet owner
- Signatures are verified using `ecrecover` function
- Message hash includes all transaction details, nonce, deadline, and contract address

### 2. Spending Cap Enforcement
- All transactions in a batch are validated against available spending limits
- Spending caps are enforced per token type
- Transactions exceeding caps are rejected entirely

### 3. Replay Protection
- Nonce-based system prevents replay attacks
- Each user has an incrementing nonce counter
- Used nonces cannot be reused

### 4. Time-bound Transactions
- Transactions include a deadline parameter
- Expired transactions are automatically rejected
- Prevents execution of stale transactions

## Gas Optimization

### 1. Batch Processing
- Multiple transactions processed in a single contract call
- Reduced gas overhead compared to individual transactions
- Optimized storage operations

### 2. Efficient Data Structures
- Minimal storage usage for spending caps and nonces
- Efficient array operations for batch processing
- Gas-optimized loops and calculations

## Error Handling

### Common Error Messages

- `"Exceeds spending cap"`: Transaction amount exceeds available spending limit
- `"Transaction expired"`: Deadline has passed
- `"Invalid nonce"`: Incorrect nonce value
- `"No transactions provided"`: Empty transaction array
- `"Too many transactions"`: Batch size exceeds limit (50)
- `"Session signer not found"`: Wallet not properly configured

### Error Recovery

1. **Spending Cap Exceeded**: Increase spending cap or reduce transaction amounts
2. **Transaction Expired**: Create new batch with updated deadline
3. **Invalid Nonce**: Refresh nonce and create new transaction
4. **Gas Estimation Failed**: Reduce batch size or transaction complexity

## Testing

### Unit Tests
- Smart contract function testing
- API endpoint testing
- Frontend component testing

### Integration Tests
- End-to-end transaction flow
- Multi-token batch transactions
- Error scenario testing

### Test Coverage
- Spending cap management
- Batch transaction execution
- Security validations
- Edge cases and error conditions

## Deployment

### Prerequisites
1. Deploy the `BatchWallet` contract to Base Sepolia
2. Set `BATCH_WALLET_CONTRACT_ADDRESS` in environment variables
3. Ensure proper Privy wallet configuration

### Deployment Steps
1. Compile the Solidity contract
2. Deploy using the provided deployment script
3. Verify contract on block explorer
4. Update environment variables
5. Test all API endpoints

## Monitoring and Maintenance

### Key Metrics
- Batch transaction success rate
- Average gas consumption
- Spending cap utilization
- Transaction processing time

### Maintenance Tasks
- Monitor contract gas usage
- Update spending cap limits as needed
- Review and update security parameters
- Optimize batch processing algorithms

## Future Enhancements

### Planned Features
1. **Multi-signature support**: Require multiple signatures for large batches
2. **Scheduled transactions**: Execute batches at specific times
3. **Advanced spending policies**: Time-based and condition-based caps
4. **Gas price optimization**: Dynamic gas pricing for batch transactions
5. **Cross-chain support**: Extend to other EVM-compatible chains

### Technical Improvements
1. **Gas optimization**: Further reduce transaction costs
2. **Performance scaling**: Support larger batch sizes
3. **Enhanced security**: Additional validation layers
4. **User experience**: Improved interface and feedback

## Support and Troubleshooting

### Common Issues
1. **Transaction failures**: Check spending caps and wallet balance
2. **Signature errors**: Verify wallet connection and permissions
3. **Network issues**: Ensure proper RPC configuration
4. **Contract interaction**: Verify contract deployment and ABI

### Getting Help
- Check the error messages in the console
- Verify all environment variables are set
- Ensure the contract is properly deployed
- Test with smaller batch sizes first

## Conclusion

The batch transaction feature provides a powerful and secure way to execute multiple transactions while maintaining spending control. The implementation balances convenience, security, and gas efficiency to create a robust solution for wallet management.

For technical support or questions about implementation, please refer to the codebase documentation or contact the development team.