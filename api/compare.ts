import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

const DECADE_BASE: Record<string, string> = {
  '1920s': '1920s vintage photograph, sepia tone, heavy grain, antique studio portrait aesthetic, waist-up couple portrait',
  '1960s': '1960s portrait photograph, warm kodachrome film stock, slightly faded colors, soft studio lighting with gentle shadows, close-up couple portrait with shallow depth of field',
};

const PERSONA_MODIFIERS: Record<string, Record<string, string>> = {
  classic: {
    '1920s': 'dignified couple, formal 1920s evening wear, art deco backdrop, composed elegant pose',
    '1960s': 'well-dressed couple in tailored 1960s attire, slim-cut suits or A-line dresses, neat hair, neutral studio backdrop, warm composed expressions',
  },
  rebel: {
    '1920s': 'bootlegger couple, dark speakeasy setting, moody low lighting, cigarette smoke, defiant expressions',
    '1960s': 'bohemian couple, turtlenecks and suede jackets, tousled hair, round sunglasses, candid snapshot feel, brick wall or doorway backdrop, defiant half-smiles',
  },
  star: {
    '1920s': 'silent film star couple, dramatic studio lighting, glamorous makeup, luxurious fabrics',
    '1960s': 'glamorous 1960s couple, sleek evening wear, bouffant or slicked hair, warm studio portrait lighting, poised and magnetic, old hollywood warmth',
  },
  visionary: {
    '1920s': 'eccentric inventor couple, round spectacles, workshop setting, curious intensity, period workwear',
    '1960s': 'intellectual couple, thick-rimmed glasses, tweed and button-downs, books or chalkboard in soft background, warm thoughtful expressions, university portrait feel',
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

  const { image, secondImage, decade, persona, model } = req.body;
  if (!image || !decade || !persona || !model) {
    return res.status(400).json({ error: 'Missing required fields: image, decade, persona, model' });
  }

  const stylePrompt = getStylePrompt(decade, persona);

  const fullPrompt = `Generate a photorealistic portrait of the couple shown in the provided image(s) as they would appear in the ${decade}.
    The couple should embody this persona: ${persona}.
    Visual Details: ${stylePrompt}.

    CRITICAL INSTRUCTIONS FOR LIKENESS AND GENDER:
    1. You MUST strictly preserve the exact facial features, bone structure, eye shape, nose shape, and overall likeness of the people in the source image(s).
    2. Do NOT alter their fundamental facial identity. They must be instantly recognizable as the same people.
    3. You MUST strictly preserve the gender of the people in the source image(s). Do NOT change a man into a woman or a woman into a man.
    4. Adapt the era-specific clothing to match their actual gender.
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
        model,
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
      console.error(`Compare API error (model: ${model}):`, msg);
      return res.status(500).json({ error: msg });
    }
  }

  return res.status(500).json({ error: 'Max retries exceeded' });
}
