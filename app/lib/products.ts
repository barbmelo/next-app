export type Product = {
  id: string
  name: string
  price: number
  description: string
}

export const products: Product[] = [
  {
    id: '1',
    name: 'Lumina Wireless Headphones',
    price: 89.99,
    description:
      'Over-ear wireless headphones with 30-hour battery, Bluetooth 5.3, built-in noise cancellation, foldable design (250g), and 10m range. Available in Black, White, and Midnight Blue. Includes USB-C cable and carrying pouch.',
  },
  {
    id: '2',
    name: 'SoundPod Mini Bluetooth Speaker',
    price: 49.99,
    description:
      'Compact waterproof (IPX7) portable speaker with 360-degree sound, 12-hour battery, and Bluetooth 5.0. Weighs only 300g. Available in Red, Black, and Forest Green. Built-in microphone for hands-free calls.',
  },
  {
    id: '3',
    name: 'NovaBuds Pro True Wireless Earbuds',
    price: 59.99,
    description:
      'True wireless earbuds with active noise cancellation, 8-hour battery (32 hours with case), IPX5 water resistance, and touch controls. Includes three ear tip sizes. Available in White and Graphite.',
  },
  {
    id: '4',
    name: 'FlexCharge 20000mAh Power Bank',
    price: 39.99,
    description:
      'High-capacity power bank with 65W USB-C Power Delivery, two USB-A ports, and LED charge indicator. Can charge a laptop once or a phone five times. Airline approved. Weighs 440g.',
  },
  {
    id: '5',
    name: 'ClearView 4K Webcam',
    price: 79.99,
    description:
      '4K 30fps webcam with autofocus, built-in noise-cancelling dual microphones, 90-degree field of view, and privacy shutter. Compatible with Windows, macOS, and Linux. Plug-and-play via USB-C.',
  },
  {
    id: '6',
    name: 'TypeFlow Mechanical Keyboard',
    price: 119.99,
    description:
      'Tenkeyless mechanical keyboard with tactile brown switches, per-key RGB lighting, USB-C detachable cable, and aluminum top plate. Compatible with Windows and macOS. Available in Space Gray and Silver.',
  },
]
