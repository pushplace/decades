import React, { useRef, useState } from 'react';
import { AppState, Decade } from '../types';

interface ResultsGridProps {
  appState: AppState;
  onReset: () => void;
  onRetry?: (era: Decade) => void;
}

export const ResultsGrid: React.FC<ResultsGridProps> = ({ appState, onReset, onRetry }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const eras = [Decade.Twenties, Decade.Fifties, Decade.Sixties, Decade.Eighties, Decade.Nineties, Decade.Future];

  const handleDownload = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsDownloading(true);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High res output
    const width = 2400;
    const padding = 100;
    const gap = 60;
    const labelHeight = 80;
    const imageSize = (width - (padding * 2) - gap) / 2;
    const titleAreaHeight = 400;
    const rows = 3;
    const height = titleAreaHeight + rows * (imageSize + labelHeight) + (rows - 1) * gap + padding;

    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = '#fdfbf7'; // Warm white paper
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.font = 'bold 120px "Playfair Display", serif';
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = 'center';
    ctx.fillText("DECADES APART", width / 2, 200);

    if (appState.userName) {
      ctx.font = 'italic 60px "Playfair Display", serif';
      ctx.fillStyle = '#719483'; // Sage Green for name
      ctx.fillText(appState.userName, width / 2, 290);
    }

    // Helper to load image
    const loadImage = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    };

    // Draw images - 2 columns, 3 rows
    const rowHeight = imageSize + labelHeight + gap;
    const labels = ["1920s", "1950s", "1960s", "1980s", "1990s", "2040s"];
    const positions = labels.map((label, i) => ({
      x: padding + (i % 2) * (imageSize + gap),
      y: titleAreaHeight + Math.floor(i / 2) * rowHeight,
      label,
    }));

    try {
      for (let i = 0; i < eras.length; i++) {
        const era = eras[i];
        const gen = appState.generations[era];
        const pos = positions[i];

        if (gen.url) {
          const img = await loadImage(gen.url);
          
          // Draw Image
          ctx.drawImage(img, pos.x, pos.y, imageSize, imageSize);
          
          // Draw Label
          ctx.font = '500 40px "Inter", sans-serif';
          ctx.fillStyle = '#666';
          ctx.textAlign = 'center';
          ctx.fillText(pos.label.toUpperCase(), pos.x + (imageSize / 2), pos.y + imageSize + 60);
        }
      }

      // Download
      const link = document.createElement('a');
      link.download = `decades-apart-couples-${Date.now()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
    } catch (e) {
      console.error("Failed to generate canvas", e);
      alert("Could not generate download. Try standard browser save.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto fade-in pb-16">
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 border-b border-zinc-800 pb-6 gap-4">
        <div>
          <h2 className="text-4xl font-serif mb-2 text-white">
            The <span className="text-[#719483] capitalize">{appState.selectedPersona}</span> Timeline
          </h2>
          <p className="text-zinc-400">Your journey through time, styled to match your vibe.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={onReset}
            className="px-6 py-2 rounded-full border border-zinc-700 text-sm font-medium hover:bg-zinc-800 hover:text-[#719483] hover:border-[#719483] transition-colors"
          >
            Start Over
          </button>
          <button 
            onClick={handleDownload}
            disabled={isDownloading}
            className="px-6 py-2 rounded-full bg-[#719483] text-white text-sm font-medium hover:bg-[#5f7d6e] transition-colors disabled:opacity-50 shadow-lg shadow-[#719483]/20"
          >
            {isDownloading ? 'Preparing...' : 'Download Frame'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8 bg-zinc-900 p-4 md:p-8 rounded-xl border border-zinc-800 shadow-2xl">
        {eras.map((era) => {
          const gen = appState.generations[era];
          return (
            <div key={era} className="flex flex-col gap-3 group">
              <div className="aspect-square relative overflow-hidden rounded-lg bg-zinc-950 border border-zinc-800 ring-1 ring-white/5 group-hover:ring-[#719483]/50 transition-all duration-500">
                {gen.loading ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="w-8 h-8 border-2 border-[#719483]/20 border-t-[#719483] rounded-full animate-spin mb-4"></div>
                    <span className="text-xs uppercase tracking-widest text-zinc-500">Traveling to {era}...</span>
                  </div>
                ) : gen.error ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                    <span className="text-red-400 text-sm mb-3">{gen.error}</span>
                    {onRetry && (
                      <button
                        onClick={() => onRetry(era)}
                        className="px-4 py-1.5 rounded-full border border-zinc-600 text-xs text-zinc-300 hover:border-[#719483] hover:text-[#719483] transition-colors"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                ) : gen.url ? (
                  <img 
                    src={gen.url} 
                    alt={`Couple in the ${era}`} 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                  />
                ) : (
                  <div className="absolute inset-0 bg-zinc-900" />
                )}
              </div>
              <div className="flex justify-between items-baseline border-t border-zinc-800 pt-3">
                <span className="font-serif text-xl text-zinc-300 group-hover:text-[#719483] transition-colors">{era}</span>
                <span className="text-xs text-zinc-600 uppercase tracking-wider">
                  {appState.selectedPersona} Vibe
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};