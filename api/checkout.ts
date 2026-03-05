import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
}
