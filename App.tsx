import React, { useState, useEffect } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { ResultsGrid } from './components/ResultsGrid';
import { TokenDisplay } from './components/TokenDisplay';
import { EmailPopup } from './components/EmailPopup';
import { AppState, Decade, Persona } from './types';
import { generateDecadePortrait } from './services/geminiService';

const INITIAL_STATE: AppState = {
  originalImage: null,
  secondImage: null,
  userName: '',
  selectedPersona: 'classic',
  isGenerating: false,
  apiKeySelected: true, // Bypass selection, assume env key is present
  tokenBalance: null,
  userEmail: null,
  generations: {
    [Decade.Twenties]: { decade: Decade.Twenties, url: '', loading: false },
    [Decade.Fifties]: { decade: Decade.Fifties, url: '', loading: false },
    [Decade.Sixties]: { decade: Decade.Sixties, url: '', loading: false },
    [Decade.Eighties]: { decade: Decade.Eighties, url: '', loading: false },
    [Decade.Nineties]: { decade: Decade.Nineties, url: '', loading: false },
    [Decade.Future]: { decade: Decade.Future, url: '', loading: false },
  }
};

const PERSONAS: { id: Persona; label: string; emoji: string; desc: string }[] = [
  { id: 'classic', label: 'The Classic', emoji: '🎩', desc: 'Timeless, elegant, and refined' },
  { id: 'rebel', label: 'The Rebel', emoji: '🔥', desc: 'Edgy, bold, and counter-culture' },
  { id: 'star', label: 'The Star', emoji: '✨', desc: 'Glamorous, famous, and spotlight-ready' },
  { id: 'visionary', label: 'The Visionary', emoji: '🧠', desc: 'Eccentric, smart, and ahead of time' },
];

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [showEmailPopup, setShowEmailPopup] = useState(false);

  const fetchBalance = async (email: string) => {
    try {
      const res = await fetch(`/api/tokens/balance?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const { balance } = await res.json();
        setState(prev => ({ ...prev, tokenBalance: balance, userEmail: email }));
      }
    } catch {
      // silently fail — token system is optional
    }
  };

  useEffect(() => {
    const email = localStorage.getItem('decades_email_submitted');
    if (email && email !== 'dev-skip') {
      fetchBalance(email);
    }
  }, []);

  const handleEmailKnown = (email: string) => {
    fetchBalance(email);
  };

  const handleTokensSpent = () => {
    if (state.userEmail) fetchBalance(state.userEmail);
  };

  const proceedToTokenCheckout = async (email: string) => {
    try {
      const res = await fetch('/api/tokens/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        const { checkoutUrl } = await res.json();
        window.location.href = checkoutUrl;
      }
    } catch {
      // ignore
    }
  };

  const handleBuyTokens = async () => {
    const email = state.userEmail || localStorage.getItem('decades_email_submitted');
    if (!email || email === 'dev-skip') {
      // No email yet — show the email popup
      setShowEmailPopup(true);
      return;
    }
    await proceedToTokenCheckout(email);
  };

  const handleEmailPopupSubmit = async (email: string) => {
    setShowEmailPopup(false);
    handleEmailKnown(email);
    await proceedToTokenCheckout(email);
  };

  const handleGenerate = async () => {
    if (!state.originalImage) return;

    const eras = [Decade.Twenties, Decade.Fifties, Decade.Sixties, Decade.Eighties, Decade.Nineties, Decade.Future];

    setState(prev => ({
      ...prev,
      isGenerating: true,
      generations: Object.fromEntries(
        eras.map(era => [era, { ...prev.generations[era], loading: true, error: undefined, url: '' }])
      ) as AppState['generations'],
    }));

    // Use Promise.allSettled so all 6 run in parallel and we wait for all to finish
    const promises = eras.map(async (era) => {
      try {
        const url = await generateDecadePortrait(state.originalImage!, state.secondImage, era, state.selectedPersona);
        setState(prev => ({
          ...prev,
          generations: {
            ...prev.generations,
            [era]: { ...prev.generations[era], loading: false, url }
          }
        }));
      } catch (error: any) {
        const message = error?.message || 'Failed to generate';
        console.error(`Error generating ${era}:`, error);
        setState(prev => ({
          ...prev,
          generations: {
            ...prev.generations,
            [era]: { ...prev.generations[era], loading: false, error: message }
          }
        }));
      }
    });

    await Promise.allSettled(promises);
    setState(prev => ({ ...prev, isGenerating: false }));
  };

  const handleImageUpload = (base64: string) => {
    setState(prev => ({ ...prev, originalImage: base64 }));
  };

  const handleSecondImageUpload = (base64: string) => {
    setState(prev => ({ ...prev, secondImage: base64 }));
  };

  const handleReset = () => {
    // Keep API key and name, reset images
    setState(prev => ({ 
      ...INITIAL_STATE, 
      apiKeySelected: true,
      userName: prev.userName
    }));
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setState(prev => ({ ...prev, userName: name }));
  };

  const handlePersonaSelect = (persona: Persona) => {
    setState(prev => ({ ...prev, selectedPersona: persona }));
  };

  const handleRetry = async (era: Decade) => {
    if (!state.originalImage) return;
    setState(prev => ({
      ...prev,
      generations: {
        ...prev.generations,
        [era]: { ...prev.generations[era], loading: true, error: undefined }
      }
    }));
    try {
      const url = await generateDecadePortrait(state.originalImage, state.secondImage, era, state.selectedPersona);
      setState(prev => ({
        ...prev,
        generations: {
          ...prev.generations,
          [era]: { ...prev.generations[era], loading: false, url }
        }
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        generations: {
          ...prev.generations,
          [era]: { ...prev.generations[era], loading: false, error: error?.message || 'Failed to generate' }
        }
      }));
    }
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white selection:bg-[#719483]/30">
      
      <header className="p-6 md:p-10 flex justify-between items-center border-b border-white/5 bg-[#0f0f0f]/80 backdrop-blur-md sticky top-0 z-40">
        <h1 className="text-2xl font-serif tracking-tight flex items-center gap-2">
          Decades Apart <span className="text-[#719483] text-lg">✦</span>
        </h1>
        <div className="flex items-center gap-4">
          <TokenDisplay balance={state.tokenBalance} onBuyClick={handleBuyTokens} />
          <span className="hidden md:inline-block text-xs uppercase tracking-widest text-[#719483] border border-[#719483]/30 px-3 py-1 rounded-full bg-[#719483]/10">
            Now Printing 6x Set
          </span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 md:py-12">
        {!state.isGenerating && !Object.values(state.generations).some(g => g.loading || g.url || g.error) ? (
          <div className="flex flex-col items-center justify-center space-y-10 animate-fade-in-up">
            <div className="text-center space-y-6 max-w-2xl">
              <h2 className="text-5xl md:text-7xl font-serif font-medium leading-[1.1]">
                Your love story, <br />
                <span className="italic text-[#719483]">through the ages.</span>
              </h2>
              <p className="text-lg text-zinc-400 font-light max-w-lg mx-auto leading-relaxed">
                Create a stunning 6-piece magnet set of you and your partner across time. 
                <br />
                <span className="text-white font-normal">High-gloss, 3x3 inch premium prints</span> generated by Gemini AI.
              </p>
              
              <div className="flex flex-wrap justify-center gap-4 md:gap-8 pt-2">
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#719483]">
                   <span className="text-lg">✦</span> Premium Gloss
                </div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#719483]">
                   <span className="text-lg">✦</span> Strong Grip
                </div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-[#719483]">
                   <span className="text-lg">✦</span> 100-Year Ink
                </div>
              </div>
            </div>
            
            <div className="w-full max-w-2xl bg-zinc-900/50 p-6 md:p-8 rounded-2xl border border-zinc-800 shadow-2xl shadow-black/50">
               {/* Name Input */}
               <div className="mb-8">
                 <label htmlFor="name" className="block text-sm font-medium text-zinc-400 mb-2 ml-1">1. Couple Name on the magnet set</label>
                 <input 
                  type="text" 
                  id="name"
                  placeholder="E.g. The Smith Collection"
                  value={state.userName}
                  onChange={handleNameChange}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#719483] transition-all"
                 />
               </div>

               {/* Persona Selector */}
               <div className="mb-8">
                 <label className="block text-sm font-medium text-zinc-400 mb-3 ml-1">2. Choose your couple style</label>
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {PERSONAS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handlePersonaSelect(p.id)}
                        className={`
                          relative flex flex-col items-center p-4 rounded-xl border transition-all duration-200 group
                          ${state.selectedPersona === p.id 
                            ? 'bg-[#719483]/10 border-[#719483] shadow-[0_0_15px_-3px_rgba(113,148,131,0.3)]' 
                            : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900'}
                        `}
                      >
                        <div className="text-3xl mb-2 transform group-hover:scale-110 transition-transform">{p.emoji}</div>
                        <div className={`font-serif text-sm ${state.selectedPersona === p.id ? 'text-[#719483] font-bold' : 'text-zinc-300'}`}>
                          {p.label}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-1 leading-tight">{p.desc}</div>
                      </button>
                    ))}
                 </div>
               </div>

               {/* Upload */}
               <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-3 ml-1">3. Upload photos for transformation</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative">
                      {state.originalImage ? (
                        <div className="w-full h-48 rounded-2xl overflow-hidden border-2 border-[#719483] relative group">
                          <img src={state.originalImage} alt="Person 1" className="w-full h-full object-cover" />
                          <button 
                            onClick={() => setState(prev => ({ ...prev, originalImage: null }))}
                            className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full hover:bg-black/80 transition-colors"
                          >
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                          </button>
                        </div>
                      ) : (
                        <ImageUploader 
                          onImageSelected={handleImageUpload} 
                          label="<span class='font-semibold text-[#719483]'>Upload Photo 1</span><br/>(You or both of you)" 
                        />
                      )}
                    </div>
                    <div className="relative">
                      {state.secondImage ? (
                        <div className="w-full h-48 rounded-2xl overflow-hidden border-2 border-[#719483] relative group">
                          <img src={state.secondImage} alt="Person 2" className="w-full h-full object-cover" />
                          <button 
                            onClick={() => setState(prev => ({ ...prev, secondImage: null }))}
                            className="absolute top-2 right-2 bg-black/50 p-1.5 rounded-full hover:bg-black/80 transition-colors"
                          >
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                          </button>
                        </div>
                      ) : (
                        <ImageUploader 
                          onImageSelected={handleSecondImageUpload} 
                          label="<span class='font-semibold text-zinc-400'>Upload Photo 2</span><br/>(Optional partner photo)" 
                        />
                      )}
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleGenerate}
                    disabled={!state.originalImage || state.isGenerating}
                    className="w-full mt-6 bg-[#719483] text-white font-medium py-4 px-6 rounded-xl hover:bg-[#5f7d6e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#719483]/20 text-lg"
                  >
                    {state.isGenerating ? 'Generating Timeline...' : 'Generate Magnet Set'}
                  </button>
                  
                  <p className="text-center text-xs text-zinc-500 mt-4">
                    <span className="text-[#719483]">★</span> 100% Satisfaction Guarantee on all magnet orders
                  </p>
                  <p className="text-center text-[10px] text-zinc-600 mt-2">
                    Designed for couples ages 18+
                  </p>
               </div>
            </div>

            {/* Simulated Magnet Stack Visual */}
            <div className="relative w-full max-w-md mx-auto h-24 mt-8 opacity-50 grayscale pointer-events-none select-none">
                <div className="absolute left-1/2 -translate-x-1/2 top-0 flex gap-4">
                   <div className="w-16 h-16 bg-zinc-800 rounded shadow-lg rotate-[-6deg] border border-zinc-700"></div>
                   <div className="w-16 h-16 bg-zinc-800 rounded shadow-lg rotate-[3deg] border border-zinc-700 mt-2"></div>
                   <div className="w-16 h-16 bg-zinc-800 rounded shadow-lg rotate-[-3deg] border border-zinc-700"></div>
                   <div className="w-16 h-16 bg-zinc-800 rounded shadow-lg rotate-[6deg] border border-zinc-700 mt-2"></div>
                   <div className="w-16 h-16 bg-zinc-800 rounded shadow-lg rotate-[-2deg] border border-zinc-700 mt-1 ml-4"></div>
                   <div className="w-16 h-16 bg-zinc-800 rounded shadow-lg rotate-[4deg] border border-zinc-700 mt-3"></div>
                </div>
                <div className="absolute top-20 w-full text-center text-xs tracking-widest text-zinc-600 uppercase">
                  Preview your 6-piece magnet set instantly
                </div>
            </div>
          </div>
        ) : (
          <div className="animate-fade-in-up">
            <ResultsGrid
            appState={state}
            onReset={handleReset}
            onRetry={handleRetry}
            onTokenSpent={handleTokensSpent}
            onEmailKnown={handleEmailKnown}
            onBuyTokens={handleBuyTokens}
          />
          </div>
        )}
      </main>

      {showEmailPopup && (
        <EmailPopup
          onSubmit={handleEmailPopupSubmit}
          onClose={() => setShowEmailPopup(false)}
        />
      )}

      <footer className="border-t border-white/5 py-12 text-center text-zinc-600 text-sm">
        <p>&copy; {new Date().getFullYear()} Decades Apart. <span className="text-[#719483]">Custom Magnet Edition</span>.</p>
      </footer>
    </div>
  );
};

export default App;