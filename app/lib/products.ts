import 'server-only'

export type Product = {
  id: string
  name: string
  price: number
  description: string
}

type FakeStoreProduct = {
  id: number
  title: string
  price: number
  description: string
}

let cache: Product[] | null = null

export async function getProducts(): Promise<Product[]> {
  if (cache) return cache
  const res = await fetch('https://fakestoreapi.com/products/category/electronics', {
    next: { revalidate: 3600 },
  })
  const data: FakeStoreProduct[] = await res.json()
  cache = data.map((item) => ({
    id: String(item.id),
    name: item.title,
    price: item.price,
    description: item.description,
  }))
  return cache
}
