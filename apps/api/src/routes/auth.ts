import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { type Env } from '../shared/middleware';

const authRouter = new Hono<{ Bindings: Env }>();

// Schemas
const RegisterDeveloperSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  company: z.string().optional(),
  use_case: z.string().optional()
});

const ApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  permissions: z.array(z.enum([
    'agents:read',
    'agents:write',
    'tasks:read',
    'tasks:write',
    'wallets:read',
    'wallets:write',
    'tools:read',
    'tools:write',
    'escrow:read',
    'escrow:write'
  ])).default(['agents:read', 'tasks:read', 'tools:read']),
  expires_at: z.string().datetime().optional()
});

// OAuth config for developer portal
const OAUTH_CONFIG = {
  github: {
    authorize_url: 'https://github.com/login/oauth/authorize',
    token_url: 'https://github.com/login/oauth/access_token',
    scopes: ['user:email']
  },
  google: {
    authorize_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_url: 'https://oauth2.googleapis.com/token',
    scopes: ['email', 'profile']
  }
};

// OAuth login initiation
authRouter.get('/:provider', async (c) => {
  const provider = c.req.param('provider') as keyof typeof OAUTH_CONFIG;
  const redirectUri = c.req.query('redirect_uri') || `${c.env.FRONTEND_URL}/auth/callback`;
  const state = c.req.query('state') || crypto.randomUUID();
  
  if (!OAUTH_CONFIG[provider]) {
    throw new HTTPException(400, {
      message: 'Invalid OAuth provider'
    });
  }
  
  try {
    // Store state for CSRF protection
    await c.env.AUTH_STORE.put(
      `oauth:state:${state}`,
      JSON.stringify({
        provider,
        redirect_uri: redirectUri,
        created_at: new Date().toISOString()
      }),
      { expirationTtl: 600 } // 10 minutes
    );
    
    // Build OAuth URL
    const params = new URLSearchParams({
      client_id: c.env[`${provider.toUpperCase()}_CLIENT_ID`],
      redirect_uri: `${c.env.WORKER_URL}/api/auth/callback/${provider}`,
      scope: OAUTH_CONFIG[provider].scopes.join(' '),
      state,
      response_type: 'code'
    });
    
    if (provider === 'google') {
      params.append('access_type', 'offline');
      params.append('prompt', 'consent');
    }
    
    const authUrl = `${OAUTH_CONFIG[provider].authorize_url}?${params}`;
    
    return c.redirect(authUrl);
  } catch (error) {
    console.error('OAuth initiation error:', error);
    throw new HTTPException(500, {
      message: 'Failed to initiate OAuth flow'
    });
  }
});

// OAuth callback
authRouter.get('/callback/:provider', async (c) => {
  const provider = c.req.param('provider') as keyof typeof OAUTH_CONFIG;
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  
  if (error) {
    return c.redirect(`${c.env.FRONTEND_URL}/auth/error?message=${encodeURIComponent(error)}`);
  }
  
  if (!code || !state) {
    return c.redirect(`${c.env.FRONTEND_URL}/auth/error?message=Missing+code+or+state`);
  }
  
  try {
    // Verify state
    const stateData = await c.env.AUTH_STORE.get(`oauth:state:${state}`, 'json');
    
    if (!stateData) {
      throw new Error('Invalid or expired state');
    }
    
    // Clean up state
    await c.env.AUTH_STORE.delete(`oauth:state:${state}`);
    
    // Exchange code for tokens
    const tokenResponse = await fetch(OAUTH_CONFIG[provider].token_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: c.env[`${provider.toUpperCase()}_CLIENT_ID`],
        client_secret: c.env[`${provider.toUpperCase()}_CLIENT_SECRET`],
        redirect_uri: `${c.env.WORKER_URL}/api/auth/callback/${provider}`
      })
    });
    
    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for tokens');
    }
    
    const tokens = await tokenResponse.json();
    
    // Get user info
    let userInfo;
    if (provider === 'github') {
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Accept': 'application/json'
        }
      });
      userInfo = await userResponse.json();
    } else if (provider === 'google') {
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });
      userInfo = await userResponse.json();
    }
    
    // Create or update developer account
    const developerId = crypto.randomUUID();
    const developer = {
      id: developerId,
      email: userInfo.email,
      name: userInfo.name || userInfo.login,
      provider,
      provider_id: userInfo.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Check if developer exists
    const existingDev = await c.env.AUTH_STORE.get(`developer:${provider}:${userInfo.id}`);
    if (existingDev) {
      developer.id = existingDev;
      const devData = await c.env.AUTH_STORE.get(`developer:${existingDev}`, 'json');
      developer.created_at = devData.created_at;
    }
    
    // Store developer
    await c.env.AUTH_STORE.put(
      `developer:${developer.id}`,
      JSON.stringify(developer)
    );
    
    // Store provider mapping
    await c.env.AUTH_STORE.put(
      `developer:${provider}:${userInfo.id}`,
      developer.id
    );
    
    // Create session token
    const sessionToken = crypto.randomUUID();
    await c.env.AUTH_STORE.put(
      `session:${sessionToken}`,
      JSON.stringify({
        developer_id: developer.id,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      }),
      { expirationTtl: 7 * 24 * 60 * 60 } // 7 days
    );
    
    // Redirect to frontend with session
    return c.redirect(`${stateData.redirect_uri}?session=${sessionToken}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    return c.redirect(`${c.env.FRONTEND_URL}/auth/error?message=${encodeURIComponent(error.message)}`);
  }
});

// Get current session
authRouter.get('/session', async (c) => {
  const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (!sessionToken) {
    throw new HTTPException(401, {
      message: 'No session token provided'
    });
  }
  
  try {
    const session = await c.env.AUTH_STORE.get(`session:${sessionToken}`, 'json');
    
    if (!session) {
      throw new HTTPException(401, {
        message: 'Invalid or expired session'
      });
    }
    
    const developer = await c.env.AUTH_STORE.get(`developer:${session.developer_id}`, 'json');
    
    return c.json({
      success: true,
      session: {
        ...session,
        developer
      }
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Get session error:', error);
    throw new HTTPException(500, {
      message: 'Failed to get session'
    });
  }
});

// Create API key
authRouter.post('/api-keys', async (c) => {
  const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (!sessionToken) {
    throw new HTTPException(401, {
      message: 'Authentication required'
    });
  }
  
  const body = await c.req.json();
  const parseResult = ApiKeySchema.safeParse(body);
  
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: parseResult.error.errors
    });
  }
  
  try {
    // Verify session
    const session = await c.env.AUTH_STORE.get(`session:${sessionToken}`, 'json');
    
    if (!session) {
      throw new HTTPException(401, {
        message: 'Invalid or expired session'
      });
    }
    
    // Generate API key
    const apiKey = `sk_${c.env.ENVIRONMENT === 'production' ? 'live' : 'test'}_${crypto.randomUUID().replace(/-/g, '')}`;
    const apiKeyId = crypto.randomUUID();
    
    const apiKeyData = {
      id: apiKeyId,
      key: apiKey,
      name: parseResult.data.name,
      developer_id: session.developer_id,
      permissions: parseResult.data.permissions,
      created_at: new Date().toISOString(),
      expires_at: parseResult.data.expires_at || null,
      last_used_at: null,
      usage_count: 0
    };
    
    // Store API key
    await c.env.AUTH_STORE.put(
      `apikey:${apiKey}`,
      JSON.stringify(apiKeyData)
    );
    
    // Store in developer's key list
    const devKeys = await c.env.AUTH_STORE.get(`developer:${session.developer_id}:keys`, 'json') || [];
    devKeys.push(apiKeyId);
    await c.env.AUTH_STORE.put(
      `developer:${session.developer_id}:keys`,
      JSON.stringify(devKeys)
    );
    
    return c.json({
      success: true,
      api_key: {
        ...apiKeyData,
        key: apiKey // Only show full key on creation
      }
    }, 201);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Create API key error:', error);
    throw new HTTPException(500, {
      message: 'Failed to create API key'
    });
  }
});

// List API keys
authRouter.get('/api-keys', async (c) => {
  const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (!sessionToken) {
    throw new HTTPException(401, {
      message: 'Authentication required'
    });
  }
  
  try {
    const session = await c.env.AUTH_STORE.get(`session:${sessionToken}`, 'json');
    
    if (!session) {
      throw new HTTPException(401, {
        message: 'Invalid or expired session'
      });
    }
    
    const keyIds = await c.env.AUTH_STORE.get(`developer:${session.developer_id}:keys`, 'json') || [];
    const keys = [];
    
    for (const keyId of keyIds) {
      // Find the key by scanning (in production, use a proper index)
      const list = await c.env.AUTH_STORE.list({
        prefix: 'apikey:',
        limit: 1000
      });
      
      for (const item of list.keys) {
        const keyData = await c.env.AUTH_STORE.get(item.name, 'json');
        if (keyData && keyData.id === keyId) {
          keys.push({
            ...keyData,
            key: `${keyData.key.substring(0, 10)}...` // Mask the key
          });
          break;
        }
      }
    }
    
    return c.json({
      success: true,
      api_keys: keys
    });
  } catch (error) {
    console.error('List API keys error:', error);
    throw new HTTPException(500, {
      message: 'Failed to list API keys'
    });
  }
});

// Revoke API key
authRouter.delete('/api-keys/:keyId', async (c) => {
  const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '');
  const keyId = c.req.param('keyId');
  
  if (!sessionToken) {
    throw new HTTPException(401, {
      message: 'Authentication required'
    });
  }
  
  try {
    const session = await c.env.AUTH_STORE.get(`session:${sessionToken}`, 'json');
    
    if (!session) {
      throw new HTTPException(401, {
        message: 'Invalid or expired session'
      });
    }
    
    // Find and delete the key
    const list = await c.env.AUTH_STORE.list({
      prefix: 'apikey:',
      limit: 1000
    });
    
    let deleted = false;
    for (const item of list.keys) {
      const keyData = await c.env.AUTH_STORE.get(item.name, 'json');
      if (keyData && keyData.id === keyId && keyData.developer_id === session.developer_id) {
        await c.env.AUTH_STORE.delete(item.name);
        deleted = true;
        
        // Remove from developer's key list
        const devKeys = await c.env.AUTH_STORE.get(`developer:${session.developer_id}:keys`, 'json') || [];
        const updatedKeys = devKeys.filter(id => id !== keyId);
        await c.env.AUTH_STORE.put(
          `developer:${session.developer_id}:keys`,
          JSON.stringify(updatedKeys)
        );
        
        break;
      }
    }
    
    if (!deleted) {
      throw new HTTPException(404, {
        message: 'API key not found'
      });
    }
    
    return c.json({
      success: true,
      message: 'API key revoked successfully'
    });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    
    console.error('Revoke API key error:', error);
    throw new HTTPException(500, {
      message: 'Failed to revoke API key'
    });
  }
});

// Logout
authRouter.post('/logout', async (c) => {
  const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (sessionToken) {
    await c.env.AUTH_STORE.delete(`session:${sessionToken}`);
  }
  
  return c.json({
    success: true,
    message: 'Logged out successfully'
  });
});

export { authRouter };