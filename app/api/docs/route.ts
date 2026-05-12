import { ApiReference } from '@scalar/nextjs-api-reference'
import { openApiSpec } from './openapi'

export const GET = ApiReference({
  content: openApiSpec,
  pageTitle: 'Electronics Store API',
})
