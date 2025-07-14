import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../toolRegistry';
import { z } from 'zod';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('Default Tools', () => {
    it('should register default tools on initialization', () => {
      const tools = registry.getAllTools();
      
      expect(tools).toHaveLength(4);
      expect(tools.map(t => t.name)).toContain('web_search');
      expect(tools.map(t => t.name)).toContain('get_sales_data');
      expect(tools.map(t => t.name)).toContain('sentiment_analysis');
      expect(tools.map(t => t.name)).toContain('get_weather');
    });

    it('should have correct configuration for web_search', () => {
      const tool = registry.getTool('web_search');
      
      expect(tool).toBeDefined();
      expect(tool?.description).toBe('Search the web for information');
      expect(tool?.requiresContext).toBe(false);
      expect(tool?.cacheable).toBe(true);
      expect(tool?.cacheTTL).toBe(900);
    });

    it('should have correct configuration for sentiment_analysis', () => {
      const tool = registry.getTool('sentiment_analysis');
      
      expect(tool).toBeDefined();
      expect(tool?.requiresContext).toBe(true);
      expect(tool?.cacheable).toBe(false);
    });
  });

  describe('register', () => {
    it('should register new tool', () => {
      const customTool = {
        name: 'custom_tool',
        description: 'A custom tool',
        inputSchema: z.object({ input: z.string() }),
        requiresContext: false,
        cacheable: true,
        cacheTTL: 300
      };

      registry.register(customTool);
      
      const retrieved = registry.getTool('custom_tool');
      expect(retrieved).toEqual(customTool);
    });

    it('should override existing tool', () => {
      const override = {
        name: 'web_search',
        description: 'Modified search',
        inputSchema: z.object({ q: z.string() }),
        requiresContext: true,
        cacheable: false
      };

      registry.register(override);
      
      const tool = registry.getTool('web_search');
      expect(tool?.description).toBe('Modified search');
      expect(tool?.requiresContext).toBe(true);
    });
  });

  describe('getTool', () => {
    it('should return undefined for non-existent tool', () => {
      const tool = registry.getTool('non_existent');
      expect(tool).toBeUndefined();
    });
  });

  describe('getAllTools', () => {
    it('should return all registered tools', () => {
      const initialCount = registry.getAllTools().length;
      
      registry.register({
        name: 'new_tool',
        description: 'New tool',
        inputSchema: z.object({}),
        requiresContext: false,
        cacheable: false
      });
      
      const tools = registry.getAllTools();
      expect(tools).toHaveLength(initialCount + 1);
      expect(tools.some(t => t.name === 'new_tool')).toBe(true);
    });
  });
});