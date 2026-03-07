import React, { useState } from 'react';

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

interface EmailPopupProps {
  onSubmit: (email: string) => void;
  onClose: () => void;
}

export const EmailPopup: React.FC<EmailPopupProps> = ({ onSubmit, onClose }) => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email');
      return;
    }
    setSubmitting(true);
    setError('');
    const ok = await subscribeToKlaviyo(trimmed);
    if (ok) {
      localStorage.setItem(EMAIL_GATE_KEY, trimmed);
      onSubmit(trimmed);
    } else {
      setError('Something went wrong. Try again.');
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-950 border border-zinc-700 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <h3 className="text-2xl font-serif text-white text-center mb-2">Enter your email</h3>
        <p className="text-zinc-400 text-sm text-center mb-6">
          We need your email to link the token purchase to your account.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#719483] transition-all"
            autoFocus
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#719483] text-white font-medium py-3 px-6 rounded-lg hover:bg-[#5f7d6e] transition-colors disabled:opacity-50 shadow-lg shadow-[#719483]/20"
          >
            {submitting ? 'Submitting...' : 'Continue to Buy Tokens'}
          </button>
        </form>
        <p className="text-[10px] text-zinc-600 text-center mt-3">
          We'll send you occasional updates. Unsubscribe anytime.
        </p>
      </div>
    </div>
  );
};
