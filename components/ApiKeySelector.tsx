import React, { useEffect, useState } from 'react';

// Removed conflicting global declaration for window.aistudio to fix TypeScript errors.
// We access aistudio via type assertion instead.

interface ApiKeySelectorProps {
  onKeySelected: () => void;
}

export const ApiKeySelector: React.FC<ApiKeySelectorProps> = ({ onKeySelected }) => {
  const [checking, setChecking] = useState(true);

  const checkKey = async () => {
    try {
      const win = window as any;
      if (win.aistudio && await win.aistudio.hasSelectedApiKey()) {
        onKeySelected();
      }
    } catch (e) {
      console.error("Error checking API key status", e);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectKey = async () => {
    const win = window as any;
    if (win.aistudio) {
      try {
        await win.aistudio.openSelectKey();
        // Assume success if no error thrown, as per guidance
        onKeySelected();
      } catch (e) {
        console.error("Key selection failed or cancelled", e);
        // Retry logic could go here, but for now we just let them try again
        alert("Please select a valid API key to continue.");
      }
    } else {
      alert("AI Studio environment not detected.");
    }
  };

  if (checking) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-2xl text-center">
        <h2 className="text-3xl font-serif text-white mb-4">Decades Apart</h2>
        <p className="text-zinc-400 mb-8 leading-relaxed">
          To generate high-quality portraits using the Nano Banana Pro model, you must link your Google AI Studio account.
        </p>
        
        <button
          onClick={handleSelectKey}
          className="w-full bg-white text-black font-medium py-4 px-6 rounded-lg hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
        >
          <span>Connect Google AI Account</span>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>

        <p className="mt-6 text-xs text-zinc-600">
          This uses the paid tier of Gemini API. See <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noreferrer" className="underline hover:text-zinc-400">billing documentation</a> for details.
        </p>
      </div>
    </div>
  );
};