export interface SubTaskDefinition {
  toolName: string;
  parameters: any;
  description: string;
}

export class TaskDecomposer {
  // In production, this would use an LLM to intelligently decompose tasks
  // For now, simple pattern matching
  async decompose(prompt: string): Promise<SubTaskDefinition[]> {
    const subTasks: SubTaskDefinition[] = [];
    
    // Example decomposition logic
    if (prompt.toLowerCase().includes('sales report')) {
      subTasks.push({
        toolName: 'get_sales_data',
        parameters: { timeframe: 'last_quarter' },
        description: 'Fetch sales data'
      });
      
      subTasks.push({
        toolName: 'analyze_trends',
        parameters: { dataType: 'sales' },
        description: 'Analyze sales trends'
      });
    }
    
    if (prompt.toLowerCase().includes('customer feedback')) {
      subTasks.push({
        toolName: 'get_feedback_data',
        parameters: { limit: 100 },
        description: 'Fetch recent customer feedback'
      });
      
      subTasks.push({
        toolName: 'sentiment_analysis',
        parameters: { source: 'feedback' },
        description: 'Analyze sentiment'
      });
    }
    
    // Default: search task
    if (subTasks.length === 0) {
      subTasks.push({
        toolName: 'web_search',
        parameters: { query: prompt },
        description: 'Search for information'
      });
    }
    
    return subTasks;
  }
}