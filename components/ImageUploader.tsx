import React, { useCallback } from 'react';

interface ImageUploaderProps {
  onImageSelected: (base64: string) => void;
  label?: string;
  subLabel?: string;
}

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.8;

const resizeImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Only resize if larger than max
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) {
          height = Math.round(height * (MAX_DIMENSION / width));
          width = MAX_DIMENSION;
        } else {
          width = Math.round(width * (MAX_DIMENSION / height));
          height = MAX_DIMENSION;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Could not get canvas context'));
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onImageSelected,
  label = "Click to upload your selfie",
  subLabel = "PNG, JPG or WEBP"
}) => {
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const resized = await resizeImage(file);
        onImageSelected(resized);
      } catch (err) {
        console.error('Failed to process image:', err);
      }
    }
  }, [onImageSelected]);

  return (
    <div className="w-full max-w-xl mx-auto">
      <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-zinc-700 border-dashed rounded-2xl cursor-pointer bg-zinc-900/50 hover:bg-zinc-800/50 hover:border-[#719483] transition-all group duration-300">
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <svg className="w-8 h-8 mb-3 text-zinc-500 group-hover:text-[#719483] transition-colors duration-300" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
          </svg>
          <p className="mb-2 text-sm text-zinc-400 group-hover:text-zinc-200 font-serif" dangerouslySetInnerHTML={{ __html: label }}></p>
          <p className="text-xs text-zinc-600">{subLabel}</p>
        </div>
        <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
      </label>
    </div>
  );
};
