import { SubTask } from '../types/task';

export class ResultSynthesizer {
  // In production, this would use an LLM to synthesize results
  // For now, simple aggregation
  async synthesize(originalPrompt: string, subTasks: Record<string, SubTask>): Promise<string> {
    const completedTasks = Object.values(subTasks).filter(st => st.status === 'completed');
    const failedTasks = Object.values(subTasks).filter(st => st.status === 'failed');
    
    if (completedTasks.length === 0) {
      return "I wasn't able to complete any of the required tasks. Please try again later.";
    }
    
    // Build response based on results
    let response = `Based on my analysis of "${originalPrompt}":\n\n`;
    
    for (const task of completedTasks) {
      if (task.result) {
        response += `**${this.formatToolName(task.toolName)}:**\n`;
        response += `${this.formatResult(task.result)}\n\n`;
      }
    }
    
    if (failedTasks.length > 0) {
      response += `\n_Note: Some tools encountered errors and could not complete._`;
    }
    
    return response.trim();
  }
  
  private formatToolName(toolName: string): string {
    return toolName.split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  private formatResult(result: any): string {
    if (typeof result === 'string') {
      return result;
    }
    
    if (Array.isArray(result)) {
      return result.map((item, index) => `${index + 1}. ${this.formatResult(item)}`).join('\n');
    }
    
    if (typeof result === 'object') {
      return Object.entries(result)
        .map(([key, value]) => `• ${key}: ${value}`)
        .join('\n');
    }
    
    return String(result);
  }
}