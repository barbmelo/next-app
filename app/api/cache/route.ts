import { getProductsCache } from '../../lib/products'
import { getRagCache } from '../../lib/rag'

export async function GET() {
  return Response.json({
    products: getProductsCache(),
    rag: getRagCache(),
  })
}
