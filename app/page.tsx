import ProductChat from './components/ProductChat'

export default function Home() {
  return (
    <main className="flex flex-col h-screen bg-brand-50">
      <header className="shrink-0 border-b border-gray-100 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-400 flex items-center justify-center text-white text-sm font-bold">
          E
        </div>
        <div>
          <h1 className="text-sm font-semibold text-gray-900 leading-tight">Electronics Store</h1>
          <p className="text-xs text-gray-400 leading-tight">AI Shopping Assistant</p>
        </div>
      </header>
      <ProductChat />
    </main>
  )
}
