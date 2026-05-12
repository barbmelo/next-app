import 'server-only'
import productData from './data/products.json'

export type Product = {
  id: string
  name: string
  price: number
  description: string
}

export function getProductsCache() {
  const products = productData as Product[]
  return { loaded: true, count: products.length, products }
}

export async function getProducts(): Promise<Product[]> {
  return productData as Product[]
}
