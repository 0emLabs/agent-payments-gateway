import { describe, it, expect, beforeEach } from 'vitest';
import { TokenCounter } from '../tokenCounter';

describe('TokenCounter', () => {
  let tokenCounter: TokenCounter;

  beforeEach(() => {
    tokenCounter = new TokenCounter();
  });

  describe('count', () => {
    it('should count tokens based on character length', () => {
      const text = 'Hello world';
      const result = tokenCounter.count(text);
      
      // 11 characters / 4 = 2.75, rounded up to 3
      expect(result).toBe(3);
    });

    it('should handle empty string', () => {
      const result = tokenCounter.count('');
      expect(result).toBe(0);
    });

    it('should handle long text', () => {
      const text = 'a'.repeat(100);
      const result = tokenCounter.count(text);
      
      // 100 / 4 = 25
      expect(result).toBe(25);
    });

    it('should round up fractional tokens', () => {
      const text = 'abc'; // 3 chars
      const result = tokenCounter.count(text);
      
      // 3 / 4 = 0.75, rounded up to 1
      expect(result).toBe(1);
    });
  });

  describe('countTokensInArray', () => {
    it('should count total tokens in array', () => {
      const texts = ['Hello', 'world', 'test'];
      const result = tokenCounter.countTokensInArray(texts);
      
      // 'Hello' = 2, 'world' = 2, 'test' = 1
      // Total = 5
      expect(result).toBe(5);
    });

    it('should handle empty array', () => {
      const result = tokenCounter.countTokensInArray([]);
      expect(result).toBe(0);
    });

    it('should handle array with empty strings', () => {
      const texts = ['', 'test', ''];
      const result = tokenCounter.countTokensInArray(texts);
      
      // Only 'test' contributes 1 token
      expect(result).toBe(1);
    });
  });
});