import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { getBalance, deductToken, creditTokens, isOrderAlreadyCredited } from './db.js';

dotenv.config();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ─── Shared helpers ────────────────────────────────────────────────

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── /api/generate ─────────────────────────────────────────────────

const GENERATE_DECADE_BASE: Record<string, string> = {
  '1920s': '1920s vintage photograph, sepia tone, heavy grain, antique studio portrait aesthetic, waist-up couple portrait',
  '1950s': '1950s vintage photo, kodachrome color or crisp black and white, classic americana, waist-up couple portrait',
  '1960s': '1960s portrait photograph, warm kodachrome film stock, slightly faded colors, soft studio lighting with gentle shadows, close-up couple portrait with shallow depth of field',
  '1980s': '1980s portrait, direct flash photography, saturated colors, retro aesthetic, waist-up couple portrait',
  '1990s': '1990s film photography, disposable camera or point-and-shoot aesthetic, slightly washed out colors, waist-up couple portrait',
  '2040s': 'near-future 2040s portrait, clean cinematic lighting, shot on a high-end digital camera, naturalistic but subtly elevated, waist-up couple portrait',
};

const GENERATE_PERSONA_MODIFIERS: Record<string, Record<string, string>> = {
  classic: {
    '1920s': 'dignified couple, formal 1920s evening wear, art deco backdrop, composed elegant pose',
    '1950s': 'classic couple, tailored 1950s fashion, clean-cut, diner or suburban backdrop',
    '1960s': 'well-dressed couple in tailored 1960s attire, slim-cut suits or A-line dresses, neat hair, neutral studio backdrop, warm composed expressions',
    '1980s': 'preppy couple, polo shirts or power suits, studio portrait lighting, confident and clean',
    '1990s': 'classic 90s couple, simple denim and white tees, warm natural light, effortlessly cool',
    '2040s': 'elegant couple in refined modern fashion, luxe minimalist fabrics, warm soft lighting, quietly wealthy',
  },
  rebel: {
    '1920s': 'bootlegger couple, dark speakeasy setting, moody low lighting, cigarette smoke, defiant expressions',
    '1950s': 'rockabilly couple, leather jackets, slicked hair, leaning on a car, rebellious attitude',
    '1960s': 'bohemian couple, turtlenecks and suede jackets, tousled hair, round sunglasses, candid snapshot feel, brick wall or doorway backdrop, defiant half-smiles',
    '1980s': 'punk couple, band tees, denim jackets with pins, wild hair, gritty urban setting',
    '1990s': 'grunge couple, flannel and ripped jeans, messy hair, dimly lit room, moody and intimate',
    '2040s': 'edgy couple in dark streetwear, shaved or asymmetric hair, tattoos, moody urban night setting, raw and real',
  },
  star: {
    '1920s': 'silent film star couple, dramatic studio lighting, glamorous makeup, luxurious fabrics',
    '1950s': 'hollywood golden age couple, movie premiere glamour, tailored evening wear, flashbulb lighting',
    '1960s': 'glamorous 1960s couple, sleek evening wear, bouffant or slicked hair, warm studio portrait lighting, poised and magnetic, old hollywood warmth',
    '1980s': 'pop royalty couple, bold fashion, statement jewelry, vivid colors, studio glamour shot',
    '1990s': '90s it-couple, supermodel energy, flash photography at a party, glamorous and effortless',
    '2040s': 'power couple at a gala, architectural fashion, perfect skin, editorial lighting, magazine cover quality',
  },
  visionary: {
    '1920s': 'eccentric inventor couple, round spectacles, workshop setting, curious intensity, period workwear',
    '1950s': 'atomic age power couple, sharp glasses, optimistic expressions, mid-century modern office or lab',
    '1960s': 'intellectual couple, thick-rimmed glasses, tweed and button-downs, books or chalkboard in soft background, warm thoughtful expressions, university portrait feel',
    '1980s': 'early tech couple, oversized glasses, computer lab or arcade glow, digital watch, wry confidence',
    '1990s': 'dot-com founders, casual business wear, early startup office, brick cellphone, ambitious energy',
    '2040s': 'tech founders in smart casual, minimal AR glasses, clean modern workspace, understated innovation, natural and grounded',
  },
};

function getGenerateStylePrompt(decade: string, persona: string): string {
  const base = GENERATE_DECADE_BASE[decade] || '';
  const style = GENERATE_PERSONA_MODIFIERS[persona]?.[decade] || '';
  return `${base}. Style: ${style}. Photorealistic, authentic era-appropriate texture and lighting. Consistent waist-up framing, both people clearly visible.`;
}

app.post('/api/generate', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { image, secondImage, decade, persona } = req.body;
  if (!image || !decade || !persona) {
    return res.status(400).json({ error: 'Missing required fields: image, decade, persona' });
  }

  const stylePrompt = getGenerateStylePrompt(decade, persona);

  const fullPrompt = `Generate a photorealistic portrait of the couple shown in the provided image(s) as they would appear in the ${decade}.
    The couple should embody this persona: ${persona}.
    Visual Details: ${stylePrompt}.

    CRITICAL INSTRUCTIONS:
    SUBJECT RESTRICTION: This tool is ONLY for adult couples (romantic partners). If the image contains children, minors, or anyone who appears under 18, you MUST refuse to generate and instead return ONLY the text "COUPLES_ONLY" with no image. Do not attempt to age up minors.

    LIKENESS AND GENDER:
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
        model: 'gemini-3.1-flash-image-preview',
        contents: { parts },
        config: {
          imageConfig: { aspectRatio: '1:1', imageSize: '1K' },
        },
      });

      const candidate = response?.candidates?.[0];
      const finishReason = candidate?.finishReason;

      if (finishReason === 'SAFETY' || finishReason === 'BLOCKED') {
        return res.status(400).json({ error: 'This photo couldn\'t be processed. Try a different photo — clear, well-lit couple portraits work best.' });
      }

      const responseParts = candidate?.content?.parts || [];
      for (const part of responseParts) {
        if (part.text && part.text.includes('COUPLES_ONLY')) {
          return res.status(400).json({ error: 'Decades Apart is designed for couples. Please upload a photo of you and your partner.' });
        }
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
      if (msg.includes('SAFETY') || msg.includes('blocked') || msg.includes('content filter')) {
        return res.status(400).json({ error: 'This photo couldn\'t be processed. Try a different photo — clear, well-lit couple portraits work best.' });
      }
      console.error('Gemini API error:', msg, JSON.stringify(error, null, 2));
      return res.status(500).json({ error: msg });
    }
  }

  return res.status(500).json({ error: 'Max retries exceeded' });
});

// ─── /api/compare ──────────────────────────────────────────────────

const COMPARE_DECADE_BASE: Record<string, string> = {
  '1920s': '1920s vintage photograph, sepia tone, heavy grain, antique studio portrait aesthetic, waist-up couple portrait',
  '1960s': '1960s portrait photograph, warm kodachrome film stock, slightly faded colors, soft studio lighting with gentle shadows, close-up couple portrait with shallow depth of field',
};

const COMPARE_PERSONA_MODIFIERS: Record<string, Record<string, string>> = {
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

function getCompareStylePrompt(decade: string, persona: string): string {
  const base = COMPARE_DECADE_BASE[decade] || '';
  const style = COMPARE_PERSONA_MODIFIERS[persona]?.[decade] || '';
  return `${base}. Style: ${style}. Photorealistic, authentic era-appropriate texture and lighting. Consistent waist-up framing, both people clearly visible.`;
}

app.post('/api/compare', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { image, secondImage, decade, persona, model } = req.body;
  if (!image || !decade || !persona || !model) {
    return res.status(400).json({ error: 'Missing required fields: image, decade, persona, model' });
  }

  const stylePrompt = getCompareStylePrompt(decade, persona);

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
});

// ─── /api/checkout ─────────────────────────────────────────────────

app.post('/api/checkout', async (req, res) => {
  const { photoUrls, userName } = req.body;

  if (!photoUrls || !Array.isArray(photoUrls) || photoUrls.length !== 6) {
    return res.status(400).json({ error: 'Exactly 6 photo URLs required' });
  }

  try {
    const cartRes = await fetch('https://printkit.dev/api/add-to-cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: 'magnets-3x3',
        source: 'decades-apart',
        quantity: 1,
        projectData: {
          photos: photoUrls,
          metadata: {
            app: 'decades-apart',
            userName: userName || '',
          },
        },
        properties: {
          'Project Name': userName || 'Decades Apart Set',
          '_cover_preview_url': photoUrls[0],
        },
      }),
    });

    if (!cartRes.ok) {
      const err = await cartRes.json().catch(() => ({}));
      throw new Error(err.error || `PrintKit cart error: ${cartRes.status}`);
    }

    const { redirectUrl } = await cartRes.json();
    return res.status(200).json({ redirectUrl });
  } catch (error: any) {
    console.error('Checkout error:', error);
    return res.status(500).json({ error: error.message || 'Checkout failed' });
  }
});

// ─── /api/presign ──────────────────────────────────────────────────

app.post('/api/presign', async (req, res) => {
  const { index } = req.body;
  const filename = `decades-apart-${Date.now()}-${index ?? 0}.jpg`;

  try {
    const presignRes = await fetch('https://printkit.dev/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, contentType: 'image/jpeg' }),
    });

    if (!presignRes.ok) {
      throw new Error(`Presign failed: ${presignRes.status}`);
    }

    const { uploadUrl, publicUrl } = await presignRes.json();
    return res.status(200).json({ uploadUrl, publicUrl });
  } catch (error: any) {
    console.error('Presign error:', error);
    return res.status(500).json({ error: error.message || 'Failed to get upload URL' });
  }
});

// ─── Token routes ───────────────────────────────────────────────────

app.get('/api/tokens/balance', (req, res) => {
  const email = req.query.email as string;
  if (!email) return res.status(400).json({ error: 'email required' });
  return res.json({ balance: getBalance(email) });
});

app.post('/api/tokens/deduct', (req, res) => {
  const { email, reason, decade } = req.body;
  if (!email || !reason) return res.status(400).json({ error: 'email and reason required' });
  const result = deductToken(email, reason, decade || reason);
  if (!result.success) return res.status(402).json({ error: 'insufficient_tokens' });
  return res.json({ success: true, newBalance: result.newBalance });
});

app.post('/api/tokens/checkout', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email required' });

  try {
    const cartRes = await fetch('https://printkit.dev/api/add-to-cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sku: 'token-10',
        source: 'decades-apart',
        quantity: 1,
        projectData: {
          email,
          metadata: {
            app: 'decades-apart',
          },
        },
        properties: {
          'Email': email,
        },
      }),
    });

    if (!cartRes.ok) {
      const err = await cartRes.json().catch(() => ({}));
      throw new Error(err.error || `PrintKit cart error: ${cartRes.status}`);
    }

    const { redirectUrl } = await cartRes.json();
    return res.json({ checkoutUrl: redirectUrl });
  } catch (error: any) {
    console.error('Token checkout error:', error);
    return res.status(500).json({ error: error.message || 'Token checkout failed' });
  }
});

app.post('/api/webhooks/token-purchase', (req, res) => {
  const secret = process.env.WEBHOOK_SECRET;
  const authHeader = req.headers['authorization'];

  if (secret && authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { email, orderId, quantity } = req.body as { email: string; orderId: string; quantity: number };
  if (!email || !orderId || !quantity) {
    return res.status(400).json({ error: 'email, orderId and quantity required' });
  }

  if (isOrderAlreadyCredited(orderId)) {
    return res.json({ ok: true, skipped: true });
  }

  const tokensPerUnit = parseInt(process.env.SHOPIFY_TOKENS_PER_UNIT || '10', 10);
  const delta = quantity * tokensPerUnit;
  creditTokens(email, delta, 'purchase', orderId);

  console.log(`Credited ${delta} tokens to ${email} for order ${orderId}`);
  return res.json({ ok: true, credited: delta });
});

// ─── Start server ──────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ API server running on http://localhost:${PORT}`);
});
