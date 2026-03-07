import React, { useRef, useState, useEffect } from 'react';
import { AppState, Decade } from '../types';

const KLAVIYO_PUBLIC_KEY = 'T6pj88';
const KLAVIYO_LIST_ID = 'WwZvuc';
const EMAIL_GATE_KEY = 'decades_email_submitted';

async function subscribeToKlaviyo(email: string): Promise<boolean> {
  try {
    const res = await fetch(`https://a.klaviyo.com/client/subscriptions/?company_id=${KLAVIYO_PUBLIC_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'revision': '2024-10-15' },
      body: JSON.stringify({
        data: {
          type: 'subscription',
          attributes: {
            profile: { data: { type: 'profile', attributes: { email } } },
            custom_source: 'Decades Apart',
          },
          relationships: {
            list: { data: { type: 'list', id: KLAVIYO_LIST_ID } },
          },
        },
      }),
    });
    return res.ok || res.status === 202;
  } catch {
    return false;
  }
}

interface ResultsGridProps {
  appState: AppState;
  deviceId: string;
  onReset: () => void;
  onRetry?: (era: Decade) => void;
  onRegenerateSelected?: (eras: Decade[]) => void;
  onTokenSpent?: () => void;
  onEmailKnown?: (email: string) => void;
  onBuyTokens?: () => void;
  onOutOfTokens?: () => void;
}

export const ResultsGrid: React.FC<ResultsGridProps> = ({ appState, deviceId, onReset, onRetry, onRegenerateSelected, onTokenSpent, onEmailKnown, onBuyTokens, onOutOfTokens }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [emailGated, setEmailGated] = useState(() => !localStorage.getItem(EMAIL_GATE_KEY));
  const [gateEmail, setGateEmail] = useState('');
  const [gateSubmitting, setGateSubmitting] = useState(false);
  const [gateError, setGateError] = useState('');
  const [selectedForRegen, setSelectedForRegen] = useState<Set<Decade>>(new Set());

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = gateEmail.trim();
    if (!email || !email.includes('@')) {
      setGateError('Please enter a valid email');
      return;
    }
    setGateSubmitting(true);
    setGateError('');
    const ok = await subscribeToKlaviyo(email);
    if (ok) {
      localStorage.setItem(EMAIL_GATE_KEY, email);
      setEmailGated(false);
      onEmailKnown?.(email);
    } else {
      setGateError('Something went wrong. Try again.');
    }
    setGateSubmitting(false);
  };

  const eras = [Decade.Twenties, Decade.Fifties, Decade.Sixties, Decade.Eighties, Decade.Nineties, Decade.Future];

  const allImagesReady = eras.every(era => appState.generations[era].url && !appState.generations[era].loading);

  const toggleSelectEra = (era: Decade) => {
    setSelectedForRegen(prev => {
      const next = new Set(prev);
      if (next.has(era)) next.delete(era); else next.add(era);
      return next;
    });
  };

  const handleRegenerateSelected = async () => {
    const erasToRegen = Array.from(selectedForRegen);
    if (erasToRegen.length === 0) return;

    // Block if not enough tokens
    if (appState.tokenBalance !== null && appState.tokenBalance < erasToRegen.length) {
      onOutOfTokens?.();
      return;
    }

    // Deduct all at once atomically
    const res = await fetch('/api/tokens/deduct-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, count: erasToRegen.length, reason: 'retry', ref: 'regen-' + Date.now() }),
    });

    if (!res.ok) {
      onOutOfTokens?.();
      return;
    }

    onTokenSpent?.();
    setSelectedForRegen(new Set());
    onRegenerateSelected?.(erasToRegen);
  };
  const anyLoading = eras.some(era => appState.generations[era].loading);

  const base64ToBlob = (base64Url: string): Blob => {
    const parts = base64Url.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    const binary = atob(parts[1]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  };

  const handleOrder = async () => {
    setIsOrdering(true);
    setOrderError(null);

    try {
      // Step 1: Upload each image directly from browser to S3 via presigned URLs
      const photoUrls = await Promise.all(
        eras.map(async (era, i) => {
          // Get presigned URL from our API
          const presignRes = await fetch('/api/presign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index: i }),
          });
          if (!presignRes.ok) throw new Error('Failed to get upload URL');
          const { uploadUrl, publicUrl } = await presignRes.json();

          // Upload image blob directly to S3
          const blob = base64ToBlob(appState.generations[era].url);
          const putRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'image/jpeg' },
            body: blob,
          });
          if (!putRes.ok) throw new Error(`Image upload failed for ${era}`);

          return publicUrl;
        })
      );

      // Step 2: Create cart with the public URLs (tiny payload)
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoUrls,
          userName: appState.userName,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Order failed: ${response.status}`);
      }

      const { redirectUrl } = await response.json();
      window.location.href = redirectUrl;
    } catch (error: any) {
      console.error('Order error:', error);
      setOrderError(error.message || 'Something went wrong');
    } finally {
      setIsOrdering(false);
    }
  };

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
        <div className="flex gap-3 flex-wrap justify-end">
          {selectedForRegen.size > 0 && (
            <button
              onClick={handleRegenerateSelected}
              disabled={appState.tokenBalance !== null && appState.tokenBalance < selectedForRegen.size}
              title={appState.tokenBalance !== null && appState.tokenBalance < selectedForRegen.size ? `Need ${selectedForRegen.size} tokens, you have ${appState.tokenBalance}` : undefined}
              className="px-6 py-2 rounded-full border border-[#719483] text-[#719483] text-sm font-medium hover:bg-[#719483]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Re-generate {selectedForRegen.size} Selected ({selectedForRegen.size} token{selectedForRegen.size > 1 ? 's' : ''})
            </button>
          )}
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

      <div className="relative">
        <div className={`grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8 bg-zinc-900 p-4 md:p-8 rounded-xl border border-zinc-800 shadow-2xl transition-all duration-500 ${emailGated && !anyLoading ? 'blur-lg select-none pointer-events-none' : ''}`}>
          {eras.map((era) => {
            const gen = appState.generations[era];
            const isSelected = selectedForRegen.has(era);
            return (
              <div key={era} className="flex flex-col gap-3 group">
                <div
                  className={`aspect-square relative overflow-hidden rounded-lg bg-zinc-950 border transition-all duration-300 ring-1 ring-white/5 ${isSelected ? 'border-[#719483] ring-[#719483]/50 shadow-[0_0_12px_-2px_rgba(113,148,131,0.4)]' : 'border-zinc-800 group-hover:ring-[#719483]/30'}`}
                >
                  {gen.loading ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="w-8 h-8 border-2 border-[#719483]/20 border-t-[#719483] rounded-full animate-spin mb-4"></div>
                      <span className="text-xs uppercase tracking-widest text-zinc-500">Traveling to {era}...</span>
                    </div>
                  ) : gen.error ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                      <span className="text-red-400 text-sm mb-3">{gen.error}</span>
                      {onRetry && appState.tokenBalance === 0 && onBuyTokens ? (
                        <button
                          onClick={onBuyTokens}
                          className="px-4 py-1.5 rounded-full border border-[#719483]/50 text-xs text-[#719483] hover:bg-[#719483]/10 transition-colors"
                        >
                          Buy Tokens to Retry
                        </button>
                      ) : onRetry && (
                        <button
                          onClick={async () => {
                            const res = await fetch('/api/tokens/deduct', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ deviceId, reason: 'retry', decade: era }),
                            });
                            if (!res.ok) { onOutOfTokens?.(); return; }
                            onTokenSpent?.();
                            onRetry(era);
                          }}
                          className="px-4 py-1.5 rounded-full border border-zinc-600 text-xs text-zinc-300 hover:border-[#719483] hover:text-[#719483] transition-colors"
                        >
                          {appState.tokenBalance !== null && appState.tokenBalance >= 1 ? 'Retry (1 token)' : 'Retry'}
                        </button>
                      )}
                    </div>
                  ) : gen.url ? (
                    <>
                      <img
                        src={gen.url}
                        alt={`Couple in the ${era}`}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      {/* Re-do toggle overlay */}
                      <button
                        onClick={() => toggleSelectEra(era)}
                        title={isSelected ? 'Deselect' : 'Select to re-generate'}
                        className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center border transition-all duration-200 ${isSelected ? 'bg-[#719483] border-[#719483] text-white opacity-100' : 'bg-black/50 border-zinc-600 text-zinc-400 opacity-0 group-hover:opacity-100 hover:border-[#719483] hover:text-[#719483]'}`}
                      >
                        {isSelected ? (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                        )}
                      </button>
                    </>
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

        {emailGated && !anyLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="bg-zinc-950/95 border border-zinc-700 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
              <h3 className="text-2xl font-serif text-white text-center mb-2">Your portraits are ready</h3>
              <p className="text-zinc-400 text-sm text-center mb-6">Enter your email to reveal your full timeline.</p>
              <form onSubmit={handleEmailSubmit} className="space-y-3">
                <input
                  type="email"
                  value={gateEmail}
                  onChange={e => setGateEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#719483] transition-all"
                  autoFocus
                />
                {gateError && <p className="text-red-400 text-xs">{gateError}</p>}
                <button
                  type="submit"
                  disabled={gateSubmitting}
                  className="w-full bg-[#719483] text-white font-medium py-3 px-6 rounded-lg hover:bg-[#5f7d6e] transition-colors disabled:opacity-50 shadow-lg shadow-[#719483]/20"
                >
                  {gateSubmitting ? 'Unlocking...' : 'Reveal My Timeline'}
                </button>
              </form>
              <p className="text-[10px] text-zinc-600 text-center mt-3">We'll send you occasional updates. Unsubscribe anytime.</p>
            </div>
            <button
              onClick={() => { setEmailGated(false); localStorage.setItem(EMAIL_GATE_KEY, 'dev-skip'); }}
              className="absolute top-3 right-3 text-zinc-700 hover:text-zinc-400 transition-colors"
              title="shhh"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
        )}
      </div>

      {/* Order CTA */}
      <div className="mt-10 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 text-center">
        <h3 className="text-2xl font-serif mb-2 text-white">
          Print your timeline as <span className="text-[#719483]">fridge magnets</span>
        </h3>
        <p className="text-zinc-400 mb-1">
          6 high-gloss 3x3" square magnets — thick, durable, and magnetic enough to hold your grocery list hostage.
        </p>
        <p className="text-2xl font-semibold text-white mb-6">$28 <span className="text-sm font-normal text-zinc-500">for the set</span></p>

        {orderError && (
          <p className="text-red-400 text-sm mb-4">{orderError}</p>
        )}

        <button
          onClick={handleOrder}
          disabled={!allImagesReady || isOrdering}
          className="px-10 py-4 rounded-xl bg-[#719483] text-white text-lg font-medium hover:bg-[#5f7d6e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#719483]/20"
        >
          {isOrdering ? 'Preparing your order...' : anyLoading ? 'Waiting for all images...' : !allImagesReady ? 'Generate all 6 first' : 'Order Magnet Set — $28'}
        </button>

        <p className="text-xs text-zinc-600 mt-4">Ships in 3-5 business days. Printed by Social Print Studio.</p>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};