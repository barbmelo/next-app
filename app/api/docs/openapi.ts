export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Electronics Store AI Assistant',
    version: '1.0.0',
    description: 'API for the AI-powered product assistant.',
  },
  paths: {
    '/api/chat': {
      post: {
        summary: 'Send a message to the AI assistant',
        description:
          'Streams a Server-Sent Events response. Events: `text`, `tool_call`, `metadata`, `[DONE]`.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: {
                    type: 'string',
                    example: 'Do you have any good monitors?',
                  },
                  session_id: {
                    type: 'string',
                    format: 'uuid',
                    description: 'Omit to start a new session.',
                    example: '550e8400-e29b-41d4-a716-446655440000',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'SSE stream',
            content: {
              'text/event-stream': {
                schema: {
                  type: 'string',
                  example:
                    'data: {"type":"text","text":"Here are some options..."}\n\ndata: [DONE]\n\n',
                },
              },
            },
          },
        },
      },
    },
    '/api/cache': {
      get: {
        summary: 'Inspect in-memory cache state',
        description:
          'Returns the loaded status of the static product catalog and the RAG embeddings cache.',
        responses: {
          '200': {
            description: 'Cache state',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    products: {
                      type: 'object',
                      properties: {
                        loaded: { type: 'boolean', example: true },
                        count: { type: 'integer', example: 6 },
                        products: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              id: { type: 'string', example: '9' },
                              name: { type: 'string' },
                              price: { type: 'number' },
                              description: { type: 'string' },
                            },
                          },
                        },
                      },
                    },
                    rag: {
                      type: 'object',
                      properties: {
                        loaded: { type: 'boolean', example: false },
                        count: { type: 'integer', example: 0 },
                        products: {
                          type: 'array',
                          items: { type: 'string' },
                          description: 'Product names with embeddings loaded.',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}
