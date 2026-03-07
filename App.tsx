import React, { useState, useEffect } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { ResultsGrid } from './components/ResultsGrid';
import { TokenDisplay } from './components/TokenDisplay';
import { AppState, Decade, Persona } from './types';
import { generateDecadePortrait } from './services/geminiService';

async function subscribeToKlaviyo(email: string): Promise<void> {
  try {
    await fetch('https://a.klaviyo.com/client/subscriptions/?company_id=T6pj88', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'revision': '2024-10-15' },
      body: JSON.stringify({
        data: {
          type: 'subscription',
          attributes: {
            profile: { data: { type: 'profile', attributes: { email } } },
            custom_source: 'Decades Apart',
          },
          relationships: { list: { data: { type: 'list', id: 'WwZvuc' } } },
        },
      }),
    });
  } catch {}
}

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
  const [showOutOfTokens, setShowOutOfTokens] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  const fetchBalance = async (email: string) => {
    try {
      const res = await fetch(`/api/tokens/balance?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const { balance } = await res.json();
        setState(prev => ({ ...prev, tokenBalance: balance }));
      }
    } catch {}
  };

  useEffect(() => {
    const email = localStorage.getItem('decades_email_submitted');
    if (email) {
      // Returning user — load their account (creates with 12 tokens if somehow missing)
      fetch('/api/tokens/init-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
        .then(r => r.json())
        .then(({ balance }) => setState(prev => ({ ...prev, userEmail: email, tokenBalance: balance })))
        .catch(() => {});
    }
  }, []);

  const handleEmailFormSubmit = async () => {
    const email = emailInput.trim();
    if (!email || !email.includes('@')) return;
    setEmailSubmitting(true);
    try {
      const res = await fetch('/api/tokens/init-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        const { balance } = await res.json();
        setState(prev => ({ ...prev, userEmail: email, tokenBalance: balance }));
        localStorage.setItem('decades_email_submitted', email);
        subscribeToKlaviyo(email);
      }
    } catch {}
    setEmailSubmitting(false);
  };

  const handleTokensSpent = () => {
    if (state.userEmail) fetchBalance(state.userEmail);
  };

  const handleOutOfTokens = () => setShowOutOfTokens(true);

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
    } catch {}
  };

  const handleBuyTokens = async () => {
    setShowOutOfTokens(false);
    if (state.userEmail) await proceedToTokenCheckout(state.userEmail);
  };

  const handleRegenerateSelected = async (eras: Decade[]) => {
    if (!state.originalImage || eras.length === 0) return;

    setState(prev => ({
      ...prev,
      generations: {
        ...prev.generations,
        ...Object.fromEntries(
          eras.map(era => [era, { ...prev.generations[era], loading: true, error: undefined }])
        ),
      },
    }));

    const promises = eras.map(async (era) => {
      try {
        const url = await generateDecadePortrait(state.originalImage!, state.secondImage, era, state.selectedPersona);
        setState(prev => ({
          ...prev,
          generations: { ...prev.generations, [era]: { ...prev.generations[era], loading: false, url } },
        }));
      } catch (error: any) {
        setState(prev => ({
          ...prev,
          generations: { ...prev.generations, [era]: { ...prev.generations[era], loading: false, error: error?.message || 'Failed to generate' } },
        }));
      }
    });

    await Promise.allSettled(promises);
    if (state.userEmail) fetchBalance(state.userEmail);
  };

  const handleGenerate = async () => {
    if (!state.originalImage || !state.userEmail) return;

    if (state.tokenBalance !== null && state.tokenBalance < 6) {
      setShowOutOfTokens(true);
      return;
    }

    const deductRes = await fetch('/api/tokens/deduct-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: state.userEmail, count: 6, reason: 'generation', ref: 'full-set-' + Date.now() }),
    });

    if (!deductRes.ok) {
      setShowOutOfTokens(true);
      return;
    }

    const { newBalance } = await deductRes.json();
    setState(prev => ({ ...prev, tokenBalance: newBalance }));

    const eras = [Decade.Twenties, Decade.Fifties, Decade.Sixties, Decade.Eighties, Decade.Nineties, Decade.Future];

    setState(prev => ({
      ...prev,
      isGenerating: true,
      generations: Object.fromEntries(
        eras.map(era => [era, { ...prev.generations[era], loading: true, error: undefined, url: '' }])
      ) as AppState['generations'],
    }));

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
    setState(prev => ({
      ...INITIAL_STATE,
      apiKeySelected: true,
      userName: prev.userName,
      userEmail: prev.userEmail,
      tokenBalance: prev.tokenBalance,
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
          {state.userEmail && (
            <span className="hidden md:inline-block text-xs text-zinc-400 truncate max-w-[220px]" title={state.userEmail}>
              {state.userEmail}
            </span>
          )}
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

              {state.userEmail && (
                <p className="text-sm text-zinc-500 mt-2">
                  Signed in as <span className="text-zinc-200">{state.userEmail}</span>
                </p>
              )}
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

               {/* Email */}
               <div className="mb-8">
                 <label className="block text-sm font-medium text-zinc-400 mb-2 ml-1">3. Your email — get 12 free tokens, save your results</label>
                 {state.userEmail ? (
                   <div className="flex items-center justify-between bg-zinc-950 border border-[#719483]/40 rounded-lg px-4 py-3">
                     <span className="text-white text-sm">{state.userEmail}</span>
                     <button
                       onClick={() => { setState(prev => ({ ...prev, userEmail: null, tokenBalance: null })); localStorage.removeItem('decades_email_submitted'); setEmailInput(''); }}
                       className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors ml-4"
                     >
                       Change
                     </button>
                   </div>
                 ) : (
                   <div className="flex gap-2">
                     <input
                       type="email"
                       placeholder="your@email.com"
                       value={emailInput}
                       onChange={e => setEmailInput(e.target.value)}
                       onKeyDown={e => e.key === 'Enter' && handleEmailFormSubmit()}
                       className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#719483] transition-all"
                     />
                     <button
                       onClick={handleEmailFormSubmit}
                       disabled={emailSubmitting || !emailInput.includes('@')}
                       className="px-5 py-3 bg-[#719483] text-white rounded-lg hover:bg-[#5f7d6e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                     >
                       {emailSubmitting ? '...' : 'Continue'}
                     </button>
                   </div>
                 )}
               </div>

               {/* Upload */}
               <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-3 ml-1">4. Upload photos for transformation</label>
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
                  
                  {state.userEmail && state.tokenBalance !== null && state.tokenBalance < 6 && (
                    <p className="text-center text-sm text-amber-400 mt-4 mb-1">
                      You need 6 tokens to generate — you have {state.tokenBalance}.{' '}
                      <button onClick={handleBuyTokens} className="underline hover:text-amber-300 transition-colors">Buy more</button>
                    </p>
                  )}
                  <button
                    onClick={handleGenerate}
                    disabled={!state.originalImage || !state.userEmail || state.isGenerating || (state.tokenBalance !== null && state.tokenBalance < 6)}
                    className="w-full mt-3 bg-[#719483] text-white font-medium py-4 px-6 rounded-xl hover:bg-[#5f7d6e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#719483]/20 text-lg"
                  >
                    {state.isGenerating ? 'Generating Timeline...' : !state.userEmail ? 'Enter your email first' : 'Generate Magnet Set (6 tokens)'}
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
            onRegenerateSelected={handleRegenerateSelected}
            onTokenSpent={handleTokensSpent}
            onBuyTokens={handleBuyTokens}
            onOutOfTokens={handleOutOfTokens}
          />
          </div>
        )}
      </main>

      {showOutOfTokens && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-950 border border-zinc-700 rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
            <div className="text-5xl mb-4">⏳</div>
            <h3 className="text-2xl font-serif text-white mb-2">Out of tokens</h3>
            <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
              You've used all your free regenerations. Buy more tokens to keep perfecting your timeline.
            </p>
            <button
              onClick={handleBuyTokens}
              className="w-full bg-[#719483] text-white font-medium py-3 px-6 rounded-lg hover:bg-[#5f7d6e] transition-colors shadow-lg shadow-[#719483]/20 mb-3"
            >
              Buy More Tokens
            </button>
            <button
              onClick={() => setShowOutOfTokens(false)}
              className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
            >
              Maybe Later
            </button>
          </div>
        </div>
      )}

      <footer className="border-t border-white/5 py-12 text-center text-zinc-600 text-sm">
        <p>&copy; {new Date().getFullYear()} Decades Apart. <span className="text-[#719483]">Custom Magnet Edition</span>.</p>
      </footer>
    </div>
  );
};

export default App;