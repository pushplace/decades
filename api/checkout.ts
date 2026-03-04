import type { VercelRequest, VercelResponse } from '@vercel/node';

const PRINTKIT_BASE = 'https://printkit.dev/api';

interface UploadResponse {
  uploadUrl: string;
  publicUrl: string;
}

async function uploadImage(base64Data: string, index: number): Promise<string> {
  // Step 1: Get presigned URL from PrintKit
  const filename = `decades-apart-${Date.now()}-${index}.jpg`;
  const presignRes = await fetch(`${PRINTKIT_BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename,
      contentType: 'image/jpeg',
    }),
  });

  if (!presignRes.ok) {
    throw new Error(`Upload presign failed: ${presignRes.status}`);
  }

  const { uploadUrl, publicUrl }: UploadResponse = await presignRes.json();

  // Step 2: Convert base64 to binary and PUT to S3
  const binaryData = Buffer.from(base64Data, 'base64');
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body: binaryData,
  });

  if (!putRes.ok) {
    throw new Error(`S3 upload failed: ${putRes.status}`);
  }

  return publicUrl;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { images, userName } = req.body;

  if (!images || !Array.isArray(images) || images.length !== 6) {
    return res.status(400).json({ error: 'Exactly 6 images required' });
  }

  try {
    // Upload all 6 images to S3 in parallel
    const photoUrls = await Promise.all(
      images.map((img: string, i: number) => uploadImage(img, i))
    );

    // Add to cart via PrintKit
    const cartRes = await fetch(`${PRINTKIT_BASE}/add-to-cart`, {
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
