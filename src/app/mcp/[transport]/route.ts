import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";
import { prisma } from '@/app/prisma';
import { NextRequest } from 'next/server';

// Authentication helper
async function authenticateRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  console.log('[MCP] Auth header present:', !!authHeader);
  
  if (!authHeader) {
    console.log('[MCP] No auth header, returning 401');
    return null;
  }

  const token = authHeader.split(' ')[1];
  console.log('[MCP] Token extracted:', token ? 'present' : 'missing');
  
  if (!token) {
    console.log('[MCP] No token, returning 401');
    return null;
  }

  try {
    console.log('[MCP] Looking up access token in database');
    const accessToken = await prisma.accessToken.findUnique({
      where: { token },
    });

    console.log('[MCP] Access token found:', !!accessToken);
    
    if (!accessToken) {
      console.log('[MCP] No access token found, returning 401');
      return null;
    }

    console.log('[MCP] Token expires at:', accessToken.expiresAt);
    console.log('[MCP] Current time:', new Date());
    
    if (accessToken.expiresAt < new Date()) {
      console.log('[MCP] Token expired, returning 401');
      return null;
    }

    console.log('[MCP] Authentication successful');
    return accessToken;
  } catch (e) {
    console.error('[MCP] Error validating token:', e);
    return null;
  }
}

// MCP handler with authentication
const handler = async (req: Request) => {
  // Log if POST /mcp/sse includes a client_id in the body
  const url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/mcp/sse')) {
    // We need to clone the request to read the body without consuming it for later
    const requestBody = await req.clone().json().catch(() => null);
    console.log('[MCP] POST /mcp/sse: request headers:', Object.fromEntries(req.headers.entries()));
    console.log('[MCP] POST /mcp/sse: requestBody:', requestBody);
  }

  // Inject authentication here
  const nextReq = req as any as NextRequest; // for type compatibility
  const accessToken = await authenticateRequest(nextReq);
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Fetch all tools for the current user
  const userId = accessToken.userId;
  const tools = await prisma.tools.findMany({
    where: { userId },
    select: { config: true, indexId: true },
  });

  // Log request body
  const requestBody = await req.clone().json().catch(() => null);
  console.log('[MCP] Request body:', requestBody);

  return createMcpHandler(
    (server) => {
      for (const tool of tools) {
        let config = tool.config || {};
        if (typeof config === 'string') {
          try {
            config = JSON.parse(config);
          } catch (e) {
            console.warn('Failed to parse tool config as JSON:', config);
            continue;
          }
        }
        // Only use config if it's a non-null object and not an array
        if (!config || typeof config !== 'object' || Array.isArray(config)) continue;
        const name = (config as any).tool_name;
        const description = (config as any).tool_description;
        if (!name || !description) continue;
        server.tool(
          name,
          description,
          {
            query: z.string().describe('Query string for the tool'),
          },
          async ({ query }) => {
            // Fetch user's API key
            const user = await prisma.user.findUnique({
              where: { id: userId },
              select: { api_key: true, organization_id: true, project_id: true },
            });
            if (!user?.api_key || !user?.organization_id || !user?.project_id) {
              return {
                content: [
                  {
                    type: 'text',
                    text: 'User API key, organization_id, or project_id not found.',
                  },
                ],
              };
            }
            const retrieverApiUrl = `https://api.cloud.llamaindex.ai/api/v1/retrievers/retrieve?project_id=${user.project_id}&organization_id=${user.organization_id}`;
            console.log('[MCP] Calling retriever API:', retrieverApiUrl);
            
            // Build pipeline object with preset retrieval parameters if available
            const pipeline: any = {
              name,
              description,
              pipeline_id: tool.indexId,
            };
            
            // Add preset retrieval parameters if they exist in the config
            if (config.preset_retrieval_parameters) {
              pipeline.preset_retrieval_parameters = config.preset_retrieval_parameters;
            }
            
            const retrieverPayload = {
              mode: 'full',
              query,
              pipelines: [pipeline],
            };
            console.log('[MCP] Retriever payload:', retrieverPayload);
            
            try {
              console.log('[MCP] Making API request...');
              const retrieverResponse = await fetch(retrieverApiUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${user.api_key}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(retrieverPayload),
              });
              console.log('[MCP] Got response status:', retrieverResponse.status);
              
              if (!retrieverResponse.ok) {
                const errorText = await retrieverResponse.text();
                console.error('[MCP] API error:', retrieverResponse.status, errorText);
                return {
                  content: [
                    {
                      type: 'text',
                      text: `Retriever API error: ${retrieverResponse.status} - ${errorText}`,
                    },
                  ],
                };
              }
              const retrieverData = await retrieverResponse.json();
              console.log('[MCP] API response data:', retrieverData);
              return {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(retrieverData),
                  },
                ],
              };
            } catch (err) {
              console.error('[MCP] API call failed:', err);
              return {
                content: [
                  {
                    type: 'text',
                    text: `Error calling retriever API: ${err}`,
                  },
                ],
              };
            }
          }
        );
      }
    },
    {
      // Optionally add server capabilities here
    },
    {
      basePath: "/mcp",
      verboseLogs: true,
      redisUrl: process.env.REDIS_URL,
    }
  )(req);
};

export { handler as GET, handler as POST };

// CORS preflight handler
export async function OPTIONS() {
  const response = new Response(null, { status: 200 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
} 
