import React, { useState } from 'react';
import { useWritingAssistant, NavigationTab } from '../context/WritingAssistantContext';
import { Feather, BookOpen, Wand2, Sliders, Database, RotateCcw, X, FileText } from 'lucide-react';
import { ModelSelector } from './ModelSelector';

export const Header: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    samples,
    activeProfile,
    resetAllData,
  } = useWritingAssistant();

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const activeSamplesCount = samples.filter((s) => s.enabled).length;

  const navItems: Array<{ id: NavigationTab; label: string; icon: React.FC<{ className?: string }>; count?: number }> = [
    { id: 'samples', label: 'Writing Samples', icon: BookOpen, count: activeSamplesCount },
    { id: 'profile', label: 'Voice Blueprint', icon: Sliders },
    { id: 'draft-brief', label: 'Draft & Brief', icon: FileText },
    { id: 'domain', label: 'Domain Knowledge', icon: Database },
    { id: 'studio', label: 'Rewrite Studio', icon: Wand2 },
  ];

  return (
    <header className="border-b border-neutral-200 bg-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
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
          <nav className="flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap font-medium transition-colors ${
                    isActive
                      ? 'bg-neutral-900 text-white'
                      : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                  {item.count !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
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
              title="Reset default samples and profile"
              onClick={() => setShowResetConfirm(true)}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div
          id="modal-reset-confirm-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/40 backdrop-blur-xs animate-in fade-in duration-100"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowResetConfirm(false);
          }}
        >
          <div
            id="modal-reset-confirm"
            role="dialog"
            aria-modal="true"
            className="bg-white rounded-xl border border-neutral-200 shadow-xl max-w-sm w-full p-5 space-y-4 animate-in zoom-in-95 duration-100"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-neutral-900">
                  Reset to default presets?
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  This will reload standard writing samples and voice profile data.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-reset-all"
                type="button"
                onClick={() => {
                  resetAllData();
                  setShowResetConfirm(false);
                }}
                className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
