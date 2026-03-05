import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
}
