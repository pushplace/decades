import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const DECADE_BASE: Record<string, string> = {
  '1920s': '1920s vintage photograph, sepia tone, heavy grain, antique aesthetics',
  '1950s': '1950s vintage photo, kodachrome color or crisp black and white, classic americana',
  '1960s': '1960s vintage photo, black and white or muted kodachrome, film grain',
  '1980s': '1980s portrait, flash photography, vibrant colors, retro aesthetic',
  '1990s': '1990s film photography, disposable camera aesthetic, slightly washed out, authentic grunge or pop look',
  '2040s': '2040s futuristic portrait, high-tech, cinematic lighting, ultra-real',
};

const PERSONA_MODIFIERS: Record<string, Record<string, string>> = {
  classic: {
    '1920s': 'dignified couple, formal 1920s evening wear (tuxedos or flapper dresses depending on gender), great gatsby party guests, elegant pose',
    '1950s': 'classic couple, 1950s fashion (leather jackets, poodle skirts, or tailored suits depending on gender), diner or drive-in setting',
    '1960s': 'clean cut couple, mad men style suits or elegant mod dresses, timeless fashion',
    '1980s': 'preppy couple, polo shirts or power suits, studio lighting, clean look',
    '1990s': 'classic 90s couple, denim on denim, gap commercial aesthetic, simple white tees',
    '2040s': 'minimalist zen couple, sleek organic fabrics, timeless dignity, soft lighting',
  },
  rebel: {
    '1920s': 'gangster couple, peaky blinders style or rebellious flapper, smoking, moody lighting, tough expressions',
    '1950s': 'rockabilly couple, leather jackets, tattoos, motorcycles, rebellious attitude',
    '1960s': 'rocker couple, messy hair, counter-culture protesters, sunglasses, attitude',
    '1980s': 'punk rock couple, denim jackets with pins, mohawks or wild hair, neon grit',
    '1990s': 'grunge couple, flannel shirts, ripped jeans, nirvana aesthetic, moody',
    '2040s': 'cyberpunk street samurai couple, neon tattoos, tactical tech-wear, gritty urban background',
  },
  star: {
    '1920s': 'silent movie star couple, dramatic lighting, heavy makeup, luxurious fur or velvet',
    '1950s': 'hollywood golden age couple, glamorous 1950s cinema style, red carpet',
    '1960s': 'famous beatles-era pop star couple, fashion editorial, paparazzi flash style, cool aura',
    '1980s': 'pop icon couple, glitter, excessive jewelry, mullets or big perms, bright neon background',
    '1990s': '90s supermodel or rockstar couple, flash photography, glamorous, iconic',
    '2040s': 'galactic influencer couple, bioluminescent fashion, floating accessories, perfect lighting',
  },
  visionary: {
    '1920s': 'eccentric inventor couple, round glasses, tweed suits or practical vintage wear, holding blueprints',
    '1950s': 'atomic age scientist couple, lab coats, retro-futuristic gadgets, optimism',
    '1960s': 'space age scientist couple, nasa engineer style, horn rimmed glasses, focused expressions',
    '1980s': 'computer hacker couple, synth aesthetic, digital watches, arcade background',
    '1990s': 'dot com boom entrepreneurs, casual business, brick cellphones, optimistic tech',
    '2040s': 'transhumanist couple, holographic eyewear, brain interfaces, clean lab aesthetic',
  },
};

function getStylePrompt(decade: string, persona: string): string {
  const base = DECADE_BASE[decade] || '';
  const style = PERSONA_MODIFIERS[persona]?.[decade] || '';
  return `${base}. Style: ${style}. Photorealistic, authentic era-appropriate texture and lighting. Two people/couple portrait.`;
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
