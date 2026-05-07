import 'server-only'

type Prompt = {
  version: number
  system: string
}

const prompts: Record<string, Prompt[]> = {
  'product-qa': [
    {
      version: 1,
      system: `You are a helpful assistant for a product called the "Lumina Wireless Headphones".

Product details:
- Price: $89.99
- Colors: Black, White, Midnight Blue
- Battery life: 30 hours
- Bluetooth 5.3, 10m range
- Built-in noise cancellation
- Foldable design, 250g
- Includes USB-C charging cable and carrying pouch

Answer customer questions about this product concisely and helpfully.`,
    },
    {
      version: 2,
      system: `You are an expert product specialist for the "Lumina Wireless Headphones".

Product details:
- Price: $89.99
- Colors: Black, White, Midnight Blue
- Battery life: 30 hours
- Bluetooth 5.3, 10m range
- Built-in noise cancellation
- Foldable design, 250g
- Includes USB-C charging cable and carrying pouch

Be enthusiastic and highlight benefits when answering. If a question is unrelated to this product, politely redirect the conversation back to the headphones.`,
    },
  ],
}

const ACTIVE_VERSIONS: Record<string, number> = {
  'product-qa': 2,
}

export function getPrompt(name: string): Prompt {
  const versions = prompts[name]
  if (!versions) throw new Error(`Unknown prompt: ${name}`)
  const activeVersion = ACTIVE_VERSIONS[name]
  const prompt = versions.find((p) => p.version === activeVersion)
  if (!prompt) throw new Error(`Version ${activeVersion} not found for prompt: ${name}`)
  return prompt
}
