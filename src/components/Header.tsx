import React, { useState } from 'react';
import { useWritingAssistant, NavigationTab } from '../context/WritingAssistantContext';
import { Feather, RotateCcw } from 'lucide-react';
import { ModelSelector } from './ModelSelector';
import { ConfirmDialog } from './ConfirmDialog';

export const Header: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    samples,
    activeProfile,
    resetPresets,
  } = useWritingAssistant();

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const activeSamplesCount = samples.filter((s) => s.enabled).length;

  const navItems: Array<{ id: NavigationTab; label: string; count?: number }> = [
    { id: 'samples', label: 'Writing Samples', count: activeSamplesCount },
    { id: 'profile', label: 'Voice Blueprint' },
    { id: 'draft-brief', label: 'Draft & Brief' },
    { id: 'domain', label: 'Domain Knowledge' },
    { id: 'studio', label: 'Rewrite Studio' },
  ];

  return (
    <header className={`border-b border-neutral-200 bg-white z-40 ${activeTab === 'studio' ? 'relative studio-global-header' : 'sticky top-0'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-3">
          {/* Brand */}
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
              <Feather className="w-4 h-4" />
            </div>
            <span className="text-base font-semibold tracking-tight text-neutral-900">
              PersonaScript
            </span>
          </div>

          {/* Workflow Steps */}
          <nav aria-label="Writing workflow" className="order-3 flex w-full flex-wrap items-center gap-1">
            {navItems.map((item, index) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap font-medium transition-colors ${
                    isActive
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                  }`}
                >
                  <span className="font-mono opacity-70">{index + 1}</span>
                  <span>{item.label}</span>
                  {item.count !== undefined && (
                    <span
                      className={`text-[11px] px-1.5 py-0.2 rounded font-mono ${
                        isActive
                          ? 'bg-neutral-800 text-neutral-200'
                          : 'bg-neutral-200 text-neutral-700'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Model Selector, Persona and Reset */}
          <div className="flex items-center space-x-2.5">
            <ModelSelector variant="compact" />
            <span className="text-xs text-neutral-600 hidden 2xl:inline-block max-w-[120px] truncate">
              {activeProfile.name}
            </span>
            <button
              id="btn-reset-demo"
              aria-label="Reset voice and model presets"
              title="Reset voice and model presets"
              onClick={() => setShowResetConfirm(true)}
              className="text-xs text-neutral-600 hover:text-neutral-900 flex items-center gap-1.5 py-1 px-1.5 rounded-md hover:bg-neutral-100 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-neutral-500" />
              <span>Reset presets</span>
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showResetConfirm}
        title="Reset presets?"
        confirmLabel="Reset presets"
        cancelLabel="Keep everything"
        destructive
        onConfirm={() => {
          resetPresets();
          setShowResetConfirm(false);
        }}
        onCancel={() => setShowResetConfirm(false)}
      >
        <p>This restores default samples, voice, tone, and model choices. Your drafts, brief, and version history are kept.</p>
      </ConfirmDialog>
    </header>
  );
};
