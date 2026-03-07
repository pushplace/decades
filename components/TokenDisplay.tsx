import React from 'react';

interface TokenDisplayProps {
  balance: number | null;
  onBuyClick: () => void;
}

export const TokenDisplay: React.FC<TokenDisplayProps> = ({ balance, onBuyClick }) => {
  if (balance === null) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-zinc-300 flex items-center gap-1.5">
        <span className="text-[#719483]">✦</span>
        <span className="font-medium">{balance}</span>
        <span className="text-zinc-500">{balance === 1 ? 'token' : 'tokens'}</span>
      </span>
      <button
        onClick={onBuyClick}
        className="text-xs px-3 py-1 rounded-full border border-[#719483]/40 text-[#719483] hover:bg-[#719483]/10 transition-colors"
      >
        Buy More
      </button>
    </div>
  );
};
