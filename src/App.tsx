import React from 'react';
import {
  WritingAssistantProvider,
  useWritingAssistant,
} from './context/WritingAssistantContext';
import { Header } from './components/Header';
import { SamplesView } from './components/SamplesView';
import { ProfileView } from './components/ProfileView';
import { DomainView } from './components/DomainView';
import { DraftBriefView } from './components/DraftBriefView';
import { WorkspaceSaveStatus } from './components/WorkspaceSaveStatus';
import { StudioView } from './components/StudioView';

function AppContent() {
  const { activeTab } = useWritingAssistant();

  return (
    <div className={`${activeTab === 'studio' ? 'studio-app' : 'min-h-screen'} bg-neutral-50 text-neutral-900 flex flex-col font-sans`}>
      <Header />
      <WorkspaceSaveStatus />

      <main className="flex-1">
        {activeTab === 'samples' && <SamplesView />}
        {activeTab === 'profile' && <ProfileView />}
        {activeTab === 'draft-brief' && <DraftBriefView />}
        {activeTab === 'domain' && <DomainView />}
        {activeTab === 'studio' && <StudioView />}
      </main>

      <footer className="border-t border-neutral-200 bg-white py-4 text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>PersonaScript</p>
          <p className="text-[11px] text-neutral-500">
            Style and voice harmonizer
          </p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <WritingAssistantProvider>
      <AppContent />
    </WritingAssistantProvider>
  );
}
