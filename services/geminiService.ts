import { GoogleGenAI } from "@google/genai";
import { Decade, Persona } from "../types";

// Helper to remove the data URL prefix if present
const cleanBase64 = (dataUrl: string) => {
  return dataUrl.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
};

const getPromptForDecadeAndPersona = (decade: Decade, persona: Persona): string => {
  // Base atmosphere per decade
  const decadeBase = {
    [Decade.Twenties]: "1920s vintage photograph, sepia tone, heavy grain, antique aesthetics",
    [Decade.Fifties]: "1950s vintage photo, kodachrome color or crisp black and white, classic americana",
    [Decade.Sixties]: "1960s vintage photo, black and white or muted kodachrome, film grain",
    [Decade.Eighties]: "1980s portrait, flash photography, vibrant colors, retro aesthetic",
    [Decade.Nineties]: "1990s film photography, disposable camera aesthetic, slightly washed out, authentic grunge or pop look",
    [Decade.Future]: "2040s futuristic portrait, high-tech, cinematic lighting, ultra-real"
  };

  // Specific styling based on Persona
  const personaModifiers = {
    classic: {
      [Decade.Twenties]: "dignified couple, formal tuxedo and flapper dress, great gatsby party guests, elegant pose",
      [Decade.Fifties]: "classic couple, greaser leather jacket and poodle skirt or tailored suits, diner or drive-in setting",
      [Decade.Sixties]: "clean cut couple, mad men style suits and elegant mod dresses, timeless fashion",
      [Decade.Eighties]: "preppy couple, polo shirts or power suits, studio lighting, clean look",
      [Decade.Nineties]: "classic 90s couple, denim on denim, gap commercial aesthetic, simple white tees",
      [Decade.Future]: "minimalist zen couple, sleek organic fabrics, timeless dignity, soft lighting"
    },
    rebel: {
      [Decade.Twenties]: "gangster couple, peaky blinders style, smoking, moody lighting, tough expressions",
      [Decade.Fifties]: "rockabilly couple, leather jackets, tattoos, motorcycles, rebellious attitude",
      [Decade.Sixties]: "rocker couple, messy hair, counter-culture protesters, sunglasses, attitude",
      [Decade.Eighties]: "punk rock couple, denim jackets with pins, mohawks or wild hair, neon grit",
      [Decade.Nineties]: "grunge couple, flannel shirts, ripped jeans, nirvana aesthetic, moody",
      [Decade.Future]: "cyberpunk street samurai couple, neon tattoos, tactical tech-wear, gritty urban background"
    },
    star: {
      [Decade.Twenties]: "silent movie star couple, dramatic lighting, heavy makeup, luxurious fur and velvet",
      [Decade.Fifties]: "hollywood golden age couple, marilyn monroe and james dean vibes, glamour",
      [Decade.Sixties]: "famous beatles-era pop star couple, fashion editorial, paparazzi flash style, cool aura",
      [Decade.Eighties]: "pop icon couple, glitter, excessive jewelry, mullets or big perms, bright neon background",
      [Decade.Nineties]: "90s supermodel and rockstar couple, flash photography, glamorous, iconic",
      [Decade.Future]: "galactic influencer couple, bioluminescent fashion, floating accessories, perfect lighting"
    },
    visionary: {
      [Decade.Twenties]: "eccentric inventor couple, round glasses, tweed suits, holding blueprints",
      [Decade.Fifties]: "atomic age scientist couple, lab coats, retro-futuristic gadgets, optimism",
      [Decade.Sixties]: "space age scientist couple, nasa engineer style, horn rimmed glasses, focused expressions",
      [Decade.Eighties]: "computer hacker couple, synth aesthetic, digital watches, arcade background",
      [Decade.Nineties]: "dot com boom entrepreneurs, casual business, brick cellphones, optimistic tech",
      [Decade.Future]: "transhumanist couple, holographic eyewear, brain interfaces, clean lab aesthetic"
    }
  };

  const base = decadeBase[decade];
  const style = personaModifiers[persona][decade];

  return `${base}. Style: ${style}. Photorealistic, authentic era-appropriate texture and lighting. Two people/couple portrait.`;
};

export const generateDecadePortrait = async (
  base64Image: string,
  decade: Decade,
  persona: Persona
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const stylePrompt = getPromptForDecadeAndPersona(decade, persona);
    const fullPrompt = `Generate a photorealistic portrait of this couple as they would appear in the ${decade}. 
    The couple should embody this persona: ${persona}.
    Visual Details: ${stylePrompt}. 
    Ensure the faces resemble the original people but adapted to the era's styling and photography techniques.
    If only one person is in the source image, generate a matching partner or just style the single person accordingly, but prefer generating a couple if the prompt implies it.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          { 
            inlineData: { 
              mimeType: 'image/jpeg', 
              data: cleanBase64(base64Image) 
            } 
          },
          { text: fullPrompt },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "1K"
        }
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("No image data found in response");
  } catch (error) {
    console.error(`Error generating ${decade}:`, error);
    throw error;
  }
};