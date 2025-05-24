import fetch from 'cross-fetch';
import { SDKConfig, APIError } from '../types';

export abstract class BaseService {
  protected config: SDKConfig;

  constructor(config: SDKConfig) {
    this.config = config;
  }

  updateConfig(config: SDKConfig): void {
    this.config = config;
  }

  protected async request<T>(
    method: string,
    path: string,
    options: {
      body?: any;
      headers?: Record<string, string>;
      queryParams?: Record<string, string>;
    } = {}
  ): Promise<T> {
    const url = new URL(path, this.config.baseUrl);
    
    // Add query parameters
    if (options.queryParams) {
      Object.entries(options.queryParams).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Add authentication
    if (this.config.apiKey) {
      headers['X-API-Key'] = this.config.apiKey;
    }
    if (this.config.userId) {
      headers['X-User-Id'] = this.config.userId;
    }

    const requestOptions: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(this.config.timeout || 30000)
    };

    if (options.body && method !== 'GET') {
      requestOptions.body = JSON.stringify(options.body);
    }

    let lastError: Error | null = null;
    const maxRetries = this.config.retryAttempts || 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url.toString(), requestOptions);

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }));
          const error: APIError = {
            error: errorBody.error || 'Request failed',
            message: errorBody.message,
            code: errorBody.code,
            statusCode: response.status
          };

          // Don't retry on client errors
          if (response.status >= 400 && response.status < 500) {
            throw error;
          }

          lastError = new Error(error.message || error.error);
          
          // Wait before retry with exponential backoff
          if (attempt < maxRetries - 1) {
            await this.sleep(Math.pow(2, attempt) * 1000);
            continue;
          }
        }

        return await response.json();
      } catch (error) {
        if (error instanceof Error) {
          lastError = error;
          
          // Don't retry on timeout
          if (error.name === 'AbortError') {
            throw new Error('Request timeout');
          }
        }
        
        // Wait before retry
        if (attempt < maxRetries - 1) {
          await this.sleep(Math.pow(2, attempt) * 1000);
          continue;
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}