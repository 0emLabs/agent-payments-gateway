import { Env } from '../types/env';

interface RateLimitState {
  requests: number;
  windowStart: number;
  dailyUsage: number;
  lastReset: string;
}

export class RateLimiterDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  
  // Configuration
  private readonly REQUESTS_PER_MINUTE = 20;
  private readonly DAILY_LIMIT = 1000;
  private readonly WINDOW_SIZE_MS = 60000; // 1 minute
  
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }
  
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    switch (url.pathname) {
      case '/check':
        return this.handleCheck();
      case '/increment':
        return this.handleIncrement();
      case '/status':
        return this.handleStatus();
      default:
        return new Response('Not found', { status: 404 });
    }
  }  async checkAndIncrement(): Promise<boolean> {
    const state = await this.getState();
    const now = Date.now();
    
    // Reset window if needed
    if (now - state.windowStart > this.WINDOW_SIZE_MS) {
      state.requests = 0;
      state.windowStart = now;
    }
    
    // Reset daily usage if new day
    const today = new Date().toDateString();
    if (state.lastReset !== today) {
      state.dailyUsage = 0;
      state.lastReset = today;
    }
    
    // Check limits
    if (state.requests >= this.REQUESTS_PER_MINUTE) {
      return false;
    }
    
    if (state.dailyUsage >= this.DAILY_LIMIT) {
      return false;
    }
    
    // Increment counters
    state.requests++;
    state.dailyUsage++;
    
    await this.setState(state);
    return true;
  }
  
  private async handleCheck(): Promise<Response> {
    const state = await this.getState();
    const now = Date.now();
    
    // Check if would be allowed without incrementing
    const withinMinuteLimit = (now - state.windowStart > this.WINDOW_SIZE_MS) || 
                              (state.requests < this.REQUESTS_PER_MINUTE);
    const withinDailyLimit = state.dailyUsage < this.DAILY_LIMIT;
    
    return new Response(JSON.stringify({
      allowed: withinMinuteLimit && withinDailyLimit
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  private async handleIncrement(): Promise<Response> {
    const allowed = await this.checkAndIncrement();
    
    return new Response(JSON.stringify({ allowed }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  private async handleStatus(): Promise<Response> {
    const state = await this.getState();
    const now = Date.now();
    
    return new Response(JSON.stringify({
      minuteLimit: this.REQUESTS_PER_MINUTE,
      minuteUsed: state.requests,
      minuteResetIn: Math.max(0, this.WINDOW_SIZE_MS - (now - state.windowStart)),
      dailyLimit: this.DAILY_LIMIT,
      dailyUsed: state.dailyUsage
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }  private async getState(): Promise<RateLimitState> {
    const state = await this.state.storage.get<RateLimitState>('state');
    
    if (!state) {
      return {
        requests: 0,
        windowStart: Date.now(),
        dailyUsage: 0,
        lastReset: new Date().toDateString()
      };
    }
    
    return state;
  }
  
  private async setState(state: RateLimitState): Promise<void> {
    await this.state.storage.put('state', state);
  }
  
  async alarm(): Promise<void> {
    // Reset counters at midnight
    const state = await this.getState();
    state.dailyUsage = 0;
    state.lastReset = new Date().toDateString();
    await this.setState(state);
    
    // Schedule next reset
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    await this.state.storage.setAlarm(tomorrow.getTime());
  }
}