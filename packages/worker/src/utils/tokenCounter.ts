export class TokenCounter {
  // Simple token estimation (actual implementation would use proper tokenizer)
  // This is a rough approximation: ~4 characters per token
  private readonly CHARS_PER_TOKEN = 4;
  
  count(text: string): number {
    // More sophisticated counting could use tiktoken or similar
    // For now, use simple approximation
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }
  
  countTokensInArray(texts: string[]): number {
    return texts.reduce((total, text) => total + this.count(text), 0);
  }
}