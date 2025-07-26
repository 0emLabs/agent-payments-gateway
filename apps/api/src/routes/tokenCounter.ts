import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { type Env } from '../shared/middleware';

const tokenCounterRouter = new Hono<{ Bindings: Env }>();

// Schemas
const EstimateTokensSchema = z.object({
  text: z.string().min(1),
  model: z.string(),
  include_escrow: z.boolean().default(true),
  escrow_buffer_percent: z.number().min(0).max(50).default(15)
});

const BatchEstimateSchema = z.object({
  requests: z.array(z.object({
    id: z.string(),
    text: z.string(),
    model: z.string()
  })).min(1).max(100),
  include_escrow: z.boolean().default(true),
  escrow_buffer_percent: z.number().min(0).max(50).default(15)
});

const ModelInfoSchema = z.object({
  model: z.string()
});

// Estimate tokens for a single request
tokenCounterRouter.post('/estimate', async (c) => {
  const body = await c.req.json();
  const parseResult = EstimateTokensSchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: parseResult.error.errors
    });
  }

  const { text, model, include_escrow, escrow_buffer_percent } = parseResult.data;
  
  try {
    // Call Universal Token Counter API
    const response = await fetch(`${c.env.UTC_API_URL}/estimate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new HTTPException(response.status, {
        message: `Token counter API error: ${error}`
      });
    }
    
    const estimation = await response.json();
    
    // Calculate escrow amount if requested
    let result = {
      model,
      prompt_tokens: estimation.prompt_tokens,
      completion_tokens: estimation.completion_tokens || 0,
      total_tokens: estimation.total_tokens,
      cost: estimation.cost,
      cost_details: estimation.cost_details
    };
    
    if (include_escrow) {
      const escrowMultiplier = 1 + (escrow_buffer_percent / 100);
      result = {
        ...result,
        escrow: {
          buffer_percent: escrow_buffer_percent,
          total_tokens: Math.ceil(result.total_tokens * escrowMultiplier),
          total_cost: result.cost * escrowMultiplier,
          cost_details: {
            prompt: result.cost_details.prompt * escrowMultiplier,
            completion: result.cost_details.completion * escrowMultiplier
          }
        }
      };
    }
    
    return c.json({
      success: true,
      estimation: result
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Token estimation error:', error);
    throw new HTTPException(500, {
      message: 'Failed to estimate tokens'
    });
  }
});

// Batch estimate tokens
tokenCounterRouter.post('/estimate/batch', async (c) => {
  const body = await c.req.json();
  const parseResult = BatchEstimateSchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: parseResult.error.errors
    });
  }

  const { requests, include_escrow, escrow_buffer_percent } = parseResult.data;
  
  try {
    // Process requests in parallel
    const estimations = await Promise.all(
      requests.map(async (request) => {
        try {
          const response = await fetch(`${c.env.UTC_API_URL}/estimate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              text: request.text,
              model: request.model
            })
          });
          
          if (!response.ok) {
            throw new Error(`Failed to estimate for request ${request.id}`);
          }
          
          const estimation = await response.json();
          
          let result = {
            id: request.id,
            model: request.model,
            prompt_tokens: estimation.prompt_tokens,
            completion_tokens: estimation.completion_tokens || 0,
            total_tokens: estimation.total_tokens,
            cost: estimation.cost,
            cost_details: estimation.cost_details,
            status: 'success'
          };
          
          if (include_escrow) {
            const escrowMultiplier = 1 + (escrow_buffer_percent / 100);
            result = {
              ...result,
              escrow: {
                buffer_percent: escrow_buffer_percent,
                total_tokens: Math.ceil(result.total_tokens * escrowMultiplier),
                total_cost: result.cost * escrowMultiplier
              }
            };
          }
          
          return result;
        } catch (error) {
          return {
            id: request.id,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      })
    );
    
    const successful = estimations.filter(e => e.status === 'success');
    const failed = estimations.filter(e => e.status === 'error');
    
    return c.json({
      success: true,
      estimations,
      summary: {
        total_requests: requests.length,
        successful: successful.length,
        failed: failed.length,
        total_tokens: successful.reduce((sum, e) => sum + (e.total_tokens || 0), 0),
        total_cost: successful.reduce((sum, e) => sum + (e.cost || 0), 0)
      }
    });
  } catch (error) {
    console.error('Batch estimation error:', error);
    throw new HTTPException(500, {
      message: 'Failed to process batch estimation'
    });
  }
});

// Get supported models
tokenCounterRouter.get('/models', async (c) => {
  try {
    const response = await fetch(`${c.env.UTC_API_URL}/models`, {
      method: 'GET'
    });
    
    if (!response.ok) {
      throw new HTTPException(response.status, {
        message: 'Failed to fetch models from token counter'
      });
    }
    
    const models = await response.json();
    
    return c.json({
      success: true,
      models
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Get models error:', error);
    throw new HTTPException(500, {
      message: 'Failed to get supported models'
    });
  }
});

// Get model info
tokenCounterRouter.get('/models/:model', async (c) => {
  const model = c.req.param('model');
  
  try {
    const response = await fetch(`${c.env.UTC_API_URL}/models/${encodeURIComponent(model)}`, {
      method: 'GET'
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        throw new HTTPException(404, {
          message: 'Model not found'
        });
      }
      throw new HTTPException(response.status, {
        message: 'Failed to fetch model info'
      });
    }
    
    const modelInfo = await response.json();
    
    return c.json({
      success: true,
      model: modelInfo
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Get model info error:', error);
    throw new HTTPException(500, {
      message: 'Failed to get model information'
    });
  }
});

// Calculate cost for actual usage
tokenCounterRouter.post('/calculate-cost', async (c) => {
  const body = await c.req.json();
  
  const schema = z.object({
    model: z.string(),
    prompt_tokens: z.number().int().positive(),
    completion_tokens: z.number().int().nonnegative()
  });
  
  const parseResult = schema.safeParse(body);
  
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: parseResult.error.errors
    });
  }
  
  const { model, prompt_tokens, completion_tokens } = parseResult.data;
  
  try {
    const response = await fetch(`${c.env.UTC_API_URL}/calculate-cost`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt_tokens,
        completion_tokens
      })
    });
    
    if (!response.ok) {
      throw new HTTPException(response.status, {
        message: 'Failed to calculate cost'
      });
    }
    
    const cost = await response.json();
    
    return c.json({
      success: true,
      cost
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Calculate cost error:', error);
    throw new HTTPException(500, {
      message: 'Failed to calculate cost'
    });
  }
});

export { tokenCounterRouter };