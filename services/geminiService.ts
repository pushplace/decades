import { Decade, Persona } from "../types";

const cleanBase64 = (dataUrl: string) => {
  return dataUrl.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
};

export const generateDecadePortrait = async (
  base64Image: string,
  secondImage: string | null,
  decade: Decade,
  persona: Persona,
): Promise<string> => {
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
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Server error: ${response.status}`);
  }

  const data = await response.json();
  return `data:image/png;base64,${data.imageData}`;
};
