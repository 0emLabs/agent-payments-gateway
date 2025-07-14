import { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  requiresContext: boolean;
  cacheable: boolean;
  cacheTTL?: number;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  
  constructor() {
    this.registerDefaultTools();
  }
  
  private registerDefaultTools(): void {
    // Web Search Tool
    this.register({
      name: 'web_search',
      description: 'Search the web for information',
      inputSchema: z.object({
        query: z.string().describe('Search query')
      }),
      requiresContext: false,
      cacheable: true,
      cacheTTL: 900 // 15 minutes
    });
    
    // Sales Data Tool
    this.register({
      name: 'get_sales_data',
      description: 'Fetch sales data for analysis',
      inputSchema: z.object({
        timeframe: z.enum(['last_week', 'last_month', 'last_quarter', 'last_year']),
        product: z.string().optional(),
        region: z.string().optional()
      }),
      requiresContext: false,
      cacheable: true,
      cacheTTL: 3600 // 1 hour
    });
    
    // Sentiment Analysis Tool
    this.register({
      name: 'sentiment_analysis',
      description: 'Analyze sentiment of text',
      inputSchema: z.object({
        text: z.string().optional(),
        source: z.enum(['feedback', 'reviews', 'social']).optional()
      }),
      requiresContext: true, // Uses conversation context if text not provided
      cacheable: false
    });
    
    // Weather Tool
    this.register({
      name: 'get_weather',
      description: 'Get weather information',
      inputSchema: z.object({
        location: z.string(),
        units: z.enum(['celsius', 'fahrenheit']).default('celsius')
      }),
      requiresContext: false,
      cacheable: true,
      cacheTTL: 300 // 5 minutes
    });
  }
  
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }
  
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }
  
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}