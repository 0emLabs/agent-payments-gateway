import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'miniflare',
    environmentOptions: {
      bindings: {
        USDC_CONTRACT_ADDRESS: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      }
    }
  }
});
