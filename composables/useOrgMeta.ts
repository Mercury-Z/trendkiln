/** Brand colours + logo paths for leaderboard orgs (ported from the original). */
export const ORG_COLORS: Record<string, string> = {
  Anthropic: '#D4A27F',
  OpenAI: '#10A37F',
  Google: '#4285F4',
  DeepSeek: '#4D6BFE',
  Meta: '#0668E1',
  Alibaba: '#FF6A00',
  Mistral: '#F54E00',
  xAI: '#A1A1AA',
  Zhipu: '#3B82F6',
  Cohere: '#5A9B7D',
  NVIDIA: '#76B900',
  Midjourney: '#6B7DB5',
  'Black Forest Labs': '#A78BFA',
  Recraft: '#D4D4D8',
  Ideogram: '#F472B6',
  MiniMax: '#F59E0B',
  ByteDance: '#3C8CFF',
  Microsoft: '#00A4EF',
  Moonshot: '#6366F1',
  Kuaishou: '#FF4906',
  Runway: '#22D3EE',
  Luma: '#34D399',
  Pika: '#FBBF24',
  'Stability AI': '#A855F7',
  Reve: '#FB7185',
  HiDream: '#2DD4BF',
  Fal: '#F97316',
  Muse: '#C084FC',
}

export const ORG_LOGOS: Record<string, string> = {
  Anthropic: '/logos/anthropic.svg',
  OpenAI: '/logos/openai.svg',
  Google: '/logos/google.svg',
  DeepSeek: '/logos/deepseek.svg',
  Meta: '/logos/meta.svg',
  Alibaba: '/logos/alibaba.svg',
  Mistral: '/logos/mistral.svg',
  xAI: '/logos/xai.svg',
  Zhipu: '/logos/zhipu.svg',
  Cohere: '/logos/cohere.svg',
  NVIDIA: '/logos/nvidia.svg',
  Midjourney: '/logos/midjourney.svg',
  'Black Forest Labs': '/logos/blackforestlabs.svg',
  Recraft: '/logos/recraft.svg',
  Ideogram: '/logos/ideogram.svg',
  MiniMax: '/logos/minimax.svg',
  ByteDance: '/logos/bytedance.svg',
  Microsoft: '/logos/microsoft.svg',
  Moonshot: '/logos/moonshot.svg',
  Kuaishou: '/logos/kuaishou.svg',
  Runway: '/logos/runway.svg',
  Luma: '/logos/luma.svg',
  Pika: '/logos/pika.svg',
  'Stability AI': '/logos/stabilityai.svg',
  Reve: '/logos/reve.svg',
  HiDream: '/logos/hidream.svg',
  Fal: '/logos/fal.svg',
  Muse: '/logos/muse.svg',
}

/** Deterministic HSL fallback for orgs without a brand colour. */
function hashColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 55% 55%)`
}

export function orgColor(org?: string | null): string {
  if (!org) return '#71717A'
  return ORG_COLORS[org] || hashColor(org)
}

export function orgLogo(org?: string | null): string | null {
  if (!org) return null
  return ORG_LOGOS[org] ?? null
}

export function orgInitial(org?: string | null): string {
  if (!org) return '?'
  const trimmed = org.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}
