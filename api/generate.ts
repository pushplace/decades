import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const DECADE_BASE: Record<string, string> = {
  '1920s': '1920s vintage photograph, sepia tone, heavy grain, antique studio portrait aesthetic, waist-up couple portrait',
  '1950s': '1950s vintage photo, kodachrome color or crisp black and white, classic americana, waist-up couple portrait',
  '1960s': '1960s vintage photo, black and white or warm muted kodachrome, natural film grain, waist-up couple portrait',
  '1980s': '1980s portrait, direct flash photography, saturated colors, retro aesthetic, waist-up couple portrait',
  '1990s': '1990s film photography, disposable camera or point-and-shoot aesthetic, slightly washed out colors, waist-up couple portrait',
  '2040s': 'near-future 2040s portrait, clean cinematic lighting, shot on a high-end digital camera, naturalistic but subtly elevated, waist-up couple portrait',
};

const PERSONA_MODIFIERS: Record<string, Record<string, string>> = {
  classic: {
    '1920s': 'dignified couple, formal 1920s evening wear, art deco backdrop, composed elegant pose',
    '1950s': 'classic couple, tailored 1950s fashion, clean-cut, diner or suburban backdrop',
    '1960s': 'polished couple, sharp tailoring or elegant mod fashion, timeless sophistication',
    '1980s': 'preppy couple, polo shirts or power suits, studio portrait lighting, confident and clean',
    '1990s': 'classic 90s couple, simple denim and white tees, warm natural light, effortlessly cool',
    '2040s': 'elegant couple in refined modern fashion, luxe minimalist fabrics, warm soft lighting, quietly wealthy',
  },
  rebel: {
    '1920s': 'bootlegger couple, dark speakeasy setting, moody low lighting, cigarette smoke, defiant expressions',
    '1950s': 'rockabilly couple, leather jackets, slicked hair, leaning on a car, rebellious attitude',
    '1960s': 'counter-culture couple, protest march or rooftop, messy hair, sunglasses, raw attitude',
    '1980s': 'punk couple, band tees, denim jackets with pins, wild hair, gritty urban setting',
    '1990s': 'grunge couple, flannel and ripped jeans, messy hair, dimly lit room, moody and intimate',
    '2040s': 'edgy couple in dark streetwear, shaved or asymmetric hair, tattoos, moody urban night setting, raw and real',
  },
  star: {
    '1920s': 'silent film star couple, dramatic studio lighting, glamorous makeup, luxurious fabrics',
    '1950s': 'hollywood golden age couple, movie premiere glamour, tailored evening wear, flashbulb lighting',
    '1960s': 'iconic 60s celebrity couple, fashion editorial style, paparazzi flash, effortless cool',
    '1980s': 'pop royalty couple, bold fashion, statement jewelry, vivid colors, studio glamour shot',
    '1990s': '90s it-couple, supermodel energy, flash photography at a party, glamorous and effortless',
    '2040s': 'power couple at a gala, architectural fashion, perfect skin, editorial lighting, magazine cover quality',
  },
  visionary: {
    '1920s': 'eccentric inventor couple, round spectacles, workshop setting, curious intensity, period workwear',
    '1950s': 'atomic age power couple, sharp glasses, optimistic expressions, mid-century modern office or lab',
    '1960s': 'space-era intellectuals, horn-rimmed glasses, mission control or university setting, focused and brilliant',
    '1980s': 'early tech couple, oversized glasses, computer lab or arcade glow, digital watch, wry confidence',
    '1990s': 'dot-com founders, casual business wear, early startup office, brick cellphone, ambitious energy',
    '2040s': 'tech founders in smart casual, minimal AR glasses, clean modern workspace, understated innovation, natural and grounded',
  },
};

function getStylePrompt(decade: string, persona: string): string {
  const base = DECADE_BASE[decade] || '';
  const style = PERSONA_MODIFIERS[persona]?.[decade] || '';
  return `${base}. Style: ${style}. Photorealistic, authentic era-appropriate texture and lighting. Consistent waist-up framing, both people clearly visible.`;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { image, secondImage, decade, persona } = req.body;
  if (!image || !decade || !persona) {
    return res.status(400).json({ error: 'Missing required fields: image, decade, persona' });
  }

  const stylePrompt = getStylePrompt(decade, persona);

  const fullPrompt = `Generate a photorealistic portrait of the couple shown in the provided image(s) as they would appear in the ${decade}.
    The couple should embody this persona: ${persona}.
    Visual Details: ${stylePrompt}.

    CRITICAL INSTRUCTIONS FOR LIKENESS AND GENDER:
    1. You MUST strictly preserve the exact facial features, bone structure, eye shape, nose shape, and overall likeness of the people in the source image(s).
    2. Do NOT alter their fundamental facial identity. They must be instantly recognizable as the same people.
    3. You MUST strictly preserve the gender of the people in the source image(s). Do NOT change a man into a woman or a woman into a man.
    4. Adapt the era-specific clothing to match their actual gender (e.g., if it's two men, put them both in menswear appropriate for the era; if two women, put them both in womenswear).
    5. Only adapt their hair styling, clothing, makeup, and the photography style/lighting to match the ${decade} era.
    6. If two separate images are provided, combine both people into a single, natural-looking couple portrait.
    7. If only one person is in the source image(s), generate a matching partner for them, but ensure the original person's face and gender are perfectly preserved.`;

  const parts: any[] = [
    { inlineData: { mimeType: 'image/jpeg', data: image } },
  ];

  if (secondImage) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: secondImage } });
  }

  parts.push({ text: fullPrompt });

  const ai = new GoogleGenAI({ apiKey });
  const retries = 3;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts },
        config: {
          imageConfig: { aspectRatio: '1:1', imageSize: '1K' },
        },
      });

      for (const part of response?.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return res.status(200).json({ imageData: part.inlineData.data });
        }
      }

      return res.status(500).json({ error: 'No image data in response' });
    } catch (error: any) {
      if ((error?.status === 503 || error?.message?.includes('503')) && attempt < retries - 1) {
        await delay(2000 * (attempt + 1));
        continue;
      }
      const msg = error?.message || error?.toString() || 'Unknown error';
      console.error('Gemini API error:', msg, JSON.stringify(error, null, 2));
      return res.status(500).json({ error: msg });
    }
  }

  return res.status(500).json({ error: 'Max retries exceeded' });
}
