import React, { useEffect, useId, useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { PROVIDER_NAMES, type AIProvider } from '../modelChoice';

const ConnectionForm: React.FC<{ provider: AIProvider; configured?: boolean; onConnectionChange: (connected: boolean) => void }> = ({ provider, configured, onConnectionChange }) => {
  const id = useId();
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const name = PROVIDER_NAMES[provider];
  const connect = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || removing || !key.trim()) return;
    setSaving(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/connections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider, apiKey: key.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.connected !== true) throw new Error(data?.error || 'Could not connect. Try again.');
      setKey(''); setMessage('Connected. You can now choose a model.'); onConnectionChange(true);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not connect. Try again.'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (saving || removing) return;
    setRemoving(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/connections', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.connected !== false) throw new Error(data?.error || 'Could not remove the key. Try again.');
      setKey(''); setMessage('Key removed from this app. Add it again to reconnect.'); onConnectionChange(false);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not remove the key. Try again.'); }
    finally { setRemoving(false); }
  };
  return <form onSubmit={connect} className="py-4 first:pt-0 last:pb-0">
    <div className="mb-2 flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-sm font-medium text-neutral-800">{name} API key</label>
      {configured && <span className="flex items-center gap-1 text-xs text-emerald-700"><Check className="size-3" /> Key configured</span>}
    </div>
    <div className="flex gap-2">
      <input id={id} type="password" autoComplete="off" spellCheck={false} value={key} maxLength={512} disabled={saving || removing}
        onChange={(event) => { setKey(event.target.value); setError(''); setMessage(''); }}
        placeholder={configured ? 'Paste a replacement key' : 'Paste your API key'}
        aria-invalid={!!error} aria-describedby={error || message ? `${id}-status` : undefined}
        className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900 disabled:bg-neutral-50" />
      <button type="submit" disabled={saving || removing || !key.trim()} className="rounded-lg bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-40">
        {saving ? 'Checking…' : configured ? 'Update' : 'Connect'}
      </button>
    </div>
    {(error || message) && <p id={`${id}-status`} role={error ? 'alert' : 'status'} className={`mt-2 text-xs leading-5 ${error ? 'text-red-700' : 'text-emerald-700'}`}>{error || message}</p>}
    <div className="mt-2 flex items-center justify-between gap-3">
      <a href={provider === 'gemini' ? 'https://aistudio.google.com/apikey' : provider === 'openai' ? 'https://platform.openai.com/api-keys' : 'https://openrouter.ai/settings/keys'} target="_blank" rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 hover:underline">Get an API key <ExternalLink className="size-3" /></a>
      {configured && <button type="button" onClick={remove} disabled={saving || removing} aria-label={`Remove ${name} key`}
        className="text-xs text-red-700 hover:underline disabled:opacity-40">{removing ? 'Removing…' : 'Remove key'}</button>}
    </div>
  </form>;
};

export const ProviderConnections: React.FC = () => {
  const [providers, setProviders] = useState<Record<string, boolean> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/health', { signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.providers) throw new Error('Unavailable');
      if (!controller.signal.aborted) setProviders(data.providers);
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, []);
  return <div>
    <p className="mb-5 text-xs leading-5 text-neutral-500">Connect a provider to use its models. Keys are saved on this computer and take effect immediately.</p>
    <div className="divide-y divide-neutral-100">
      {(['gemini', 'openai', 'openrouter'] as const).map((provider) => <ConnectionForm key={provider} provider={provider} configured={providers?.[provider]}
        onConnectionChange={(connected) => setProviders((current) => ({ ...current, [provider]: connected }))} />)}
    </div>
    {failed && <p role="status" className="mt-3 text-xs text-neutral-500">Connection status unavailable. You can still connect a provider.</p>}
  </div>;
};
