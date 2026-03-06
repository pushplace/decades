import { Decade, Persona } from "../types";

const IS_DEV = import.meta.env.VITE_APP_MODE === 'dev';

// Stable placeholder photos from picsum (seeded so they're consistent)
const PLACEHOLDER_SEEDS: Record<string, number> = {
  '1920s': 100, '1950s': 200, '1960s': 300,
  '1980s': 400, '1990s': 500, '2040s': 600,
};

async function generatePlaceholder(decade: string): Promise<string> {
  const seed = PLACEHOLDER_SEEDS[decade] || 999;
  const res = await fetch(`https://picsum.photos/seed/${seed}/512/512`);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

const cleanBase64 = (dataUrl: string) => {
  return dataUrl.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
};

export const generateDecadePortrait = async (
  base64Image: string,
  secondImage: string | null,
  decade: Decade,
  persona: Persona,
): Promise<string> => {
  if (IS_DEV) return generatePlaceholder(decade);
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: cleanBase64(base64Image),
      secondImage: secondImage ? cleanBase64(secondImage) : null,
      decade,
      persona,
    }),
  });

  if (!response.ok) {
    if (response.status === 413) {
      throw new Error('Image too large. Please use a smaller photo.');
    }
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Server error: ${response.status}`);
  }

  const data = await response.json();
  return `data:image/png;base64,${data.imageData}`;
};
