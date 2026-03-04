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
      [Decade.Twenties]: "dignified couple, formal 1920s evening wear (tuxedos or flapper dresses depending on gender), great gatsby party guests, elegant pose",
      [Decade.Fifties]: "classic couple, 1950s fashion (leather jackets, poodle skirts, or tailored suits depending on gender), diner or drive-in setting",
      [Decade.Sixties]: "clean cut couple, mad men style suits or elegant mod dresses, timeless fashion",
      [Decade.Eighties]: "preppy couple, polo shirts or power suits, studio lighting, clean look",
      [Decade.Nineties]: "classic 90s couple, denim on denim, gap commercial aesthetic, simple white tees",
      [Decade.Future]: "minimalist zen couple, sleek organic fabrics, timeless dignity, soft lighting"
    },
    rebel: {
      [Decade.Twenties]: "gangster couple, peaky blinders style or rebellious flapper, smoking, moody lighting, tough expressions",
      [Decade.Fifties]: "rockabilly couple, leather jackets, tattoos, motorcycles, rebellious attitude",
      [Decade.Sixties]: "rocker couple, messy hair, counter-culture protesters, sunglasses, attitude",
      [Decade.Eighties]: "punk rock couple, denim jackets with pins, mohawks or wild hair, neon grit",
      [Decade.Nineties]: "grunge couple, flannel shirts, ripped jeans, nirvana aesthetic, moody",
      [Decade.Future]: "cyberpunk street samurai couple, neon tattoos, tactical tech-wear, gritty urban background"
    },
    star: {
      [Decade.Twenties]: "silent movie star couple, dramatic lighting, heavy makeup, luxurious fur or velvet",
      [Decade.Fifties]: "hollywood golden age couple, glamorous 1950s cinema style, red carpet",
      [Decade.Sixties]: "famous beatles-era pop star couple, fashion editorial, paparazzi flash style, cool aura",
      [Decade.Eighties]: "pop icon couple, glitter, excessive jewelry, mullets or big perms, bright neon background",
      [Decade.Nineties]: "90s supermodel or rockstar couple, flash photography, glamorous, iconic",
      [Decade.Future]: "galactic influencer couple, bioluminescent fashion, floating accessories, perfect lighting"
    },
    visionary: {
      [Decade.Twenties]: "eccentric inventor couple, round glasses, tweed suits or practical vintage wear, holding blueprints",
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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const generateDecadePortrait = async (
  base64Image: string,
  secondImage: string | null,
  decade: Decade,
  persona: Persona,
  retries = 3
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const stylePrompt = getPromptForDecadeAndPersona(decade, persona);
    
    // Enhanced prompt for better facial structure preservation
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
      { 
        inlineData: { 
          mimeType: 'image/jpeg', 
          data: cleanBase64(base64Image) 
        } 
      }
    ];

    if (secondImage) {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: cleanBase64(secondImage)
        }
      });
    }

    parts.push({ text: fullPrompt });

    let response;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-3-pro-image-preview',
          contents: {
            parts: parts,
          },
          config: {
            imageConfig: {
              aspectRatio: "1:1",
              imageSize: "1K"
            }
          },
        });
        break; // Success, exit retry loop
      } catch (error: any) {
        if (error?.status === 503 || error?.message?.includes('503') || error?.status === 'UNAVAILABLE') {
          if (attempt < retries - 1) {
            console.warn(`503 Error generating ${decade}. Retrying attempt ${attempt + 1}...`);
            await delay(2000 * (attempt + 1)); // Exponential backoff
            continue;
          }
        }
        throw error; // Rethrow if not 503 or out of retries
      }
    }

    for (const part of response?.candidates?.[0]?.content?.parts || []) {
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