import React, { useState } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import {
  Plus,
  Trash2,
  FileText,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Quote,
  ArrowRight,
  AlertTriangle,
  RotateCcw,
  Globe,
} from 'lucide-react';
import { UploadModal } from './UploadModal';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { WritingSample } from '../types';

export const SamplesView: React.FC = () => {
  const {
    samples,
    activeSampleId,
    setActiveSampleId,
    toggleSample,
    deleteSample,
    restoreDefaultSamples,
    analyzeSample,
    cancelSampleAnalysis,
    synthesizeProfileFromActiveSamples,
    isSynthesizingProfile,
    setActiveTab,
  } = useWritingAssistant();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sampleToDelete, setSampleToDelete] = useState<WritingSample | null>(null);
  const [deleteToast, setDeleteToast] = useState<{ title: string; id: string } | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const activeSample = samples.find((s) => s.id === activeSampleId) || samples[0];
  const activeSamplesCount = samples.filter((s) => s.enabled).length;

  const handleConfirmDelete = () => {
    if (!sampleToDelete) return;
    const deletedTitle = sampleToDelete.title;
    const deletedId = sampleToDelete.id;
    deleteSample(deletedId);
    setDeleteToast({ title: deletedTitle, id: deletedId });
    setTimeout(() => {
      setDeleteToast((cur) => (cur?.id === deletedId ? null : cur));
    }, 4000);
    setSampleToDelete(null);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Toast Notification */}
      {deleteToast && (
        <div
          id="toast-sample-deleted"
          className="p-3 bg-neutral-900 text-neutral-100 rounded-lg text-xs flex items-center justify-between border border-neutral-800"
        >
          <div className="flex items-center gap-2">
            <Trash2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span>
              Document <strong className="text-white font-medium">"{deleteToast.title}"</strong> was removed.
            </span>
          </div>
          <button
            onClick={() => setDeleteToast(null)}
            className="text-neutral-400 hover:text-white text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorBanner && (
        <div
          id="banner-sample-error"
          className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-rose-600 hover:text-rose-800 text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-neutral-200">
        <div>
          <p className="mb-2 text-xs font-medium text-neutral-500">Step 1 of 5</p>
          <h1 className="text-2xl font-semibold text-neutral-900 tracking-tight">
            Writing Samples
          </h1>
          <p className="mt-2 text-sm text-neutral-600">Add your writing and analyze its voice. Next, review the voice blueprint.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-open-upload-modal"
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add samples</span>
          </button>

          <button
            id="btn-synthesize-profile"
            type="button"
            onClick={async () => {
              setErrorBanner(null);
              try {
                await synthesizeProfileFromActiveSamples();
                setActiveTab('profile');
              } catch (e: any) {
                setErrorBanner(e.message || 'Failed to synthesize profile');
              }
            }}
            disabled={isSynthesizingProfile || activeSamplesCount === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-800 text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSynthesizingProfile ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing voice...</span>
              </>
            ) : (
              <>
                <Sliders className="w-3.5 h-3.5 text-neutral-600" />
                <span>Analyze Voice Profile ({activeSamplesCount})</span>
              </>
            )}
          </button>
          <button id="btn-samples-to-profile" type="button" onClick={() => setActiveTab('profile')}
            className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-800">
            Continue to Voice Blueprint <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {samples.length === 0 ? (
        <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center space-y-4">
          <FileText className="w-10 h-10 text-neutral-300 mx-auto" />
          <div className="space-y-1">
            <h3 className="text-base font-medium text-neutral-900">
              No writing samples yet
            </h3>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Add your own articles, emails, or essays to build your authentic voice profile.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 text-xs font-medium transition"
            >
              Add sample
            </button>
            <button
              onClick={restoreDefaultSamples}
              className="px-4 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-medium transition flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Load example samples</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Sample List */}
          <div className="lg:col-span-4 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-medium text-neutral-500">
                Documents ({samples.length})
              </span>
              <span className="text-xs text-neutral-400">
                {activeSamplesCount} active
              </span>
            </div>

            <div className="space-y-2">
              {samples.map((sample) => {
                const isSelected = sample.id === activeSample?.id;
                return (
                  <div
                    key={sample.id}
                    id={`sample-card-${sample.id}`}
                    onClick={() => setActiveSampleId(sample.id)}
                    className={`p-3.5 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? 'border-neutral-900 bg-white shadow-xs'
                        : 'border-neutral-200 bg-white hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          id={`toggle-sample-${sample.id}`}
                          checked={sample.enabled}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleSample(sample.id);
                          }}
                          className="w-3.5 h-3.5 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900 cursor-pointer mt-0.5"
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-medium text-neutral-900 truncate">
                            {sample.title}
                          </h4>
                          <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 mt-0.5">
                            <span className="font-mono flex items-center gap-1">
                              {(sample.fileType === 'portfolio' || sample.fileType === 'url') && (
                                <Globe className="w-2.5 h-2.5 text-neutral-500" />
                              )}
                              <span>{sample.fileType === 'url' ? 'link' : sample.fileType}</span>
                            </span>
                            <span>•</span>
                            <span>{sample.wordCount} words</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {sample.analyzing && (
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 animate-ping mr-1" />
                        )}
                        <button
                          id={`btn-delete-sample-${sample.id}`}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSampleToDelete(sample);
                          }}
                          className="p-1 text-neutral-400 hover:text-neutral-900 rounded transition"
                          title={`Delete sample "${sample.title}"`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {sample.analysis && (
                      <p className="text-[11px] text-neutral-500 line-clamp-2 mt-2 pt-2 border-t border-neutral-100 italic">
                        "{sample.analysis.summary}"
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Sample Analysis */}
          <div className="lg:col-span-8">
            {activeSample ? (
              <div className="bg-white rounded-xl border border-neutral-200 p-6 space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
                  <div>
                    <h2 className="text-lg font-semibold text-neutral-900">
                      {activeSample.title}
                    </h2>
                    <div className="flex items-center gap-2 text-xs text-neutral-400 mt-0.5 font-mono">
                      <span>{activeSample.wordCount} words</span>
                      <span>•</span>
                      <span>{activeSample.fileType}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      id="btn-reanalyze-sample"
                      type="button"
                      onClick={() => activeSample.analyzing ? cancelSampleAnalysis(activeSample.id) : analyzeSample(activeSample.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-700 hover:bg-neutral-50 transition"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${activeSample.analyzing ? 'animate-spin' : ''}`}
                      />
                      <span>{activeSample.analyzing ? 'Cancel analysis' : activeSample.analysis ? 'Re-analyze' : 'Analyze sample'}</span>
                    </button>

                    <button
                      id="btn-delete-active-sample"
                      type="button"
                      onClick={() => setSampleToDelete(activeSample)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-neutral-200 text-xs font-medium text-neutral-600 hover:text-rose-600 hover:border-rose-200 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {activeSample.analysisError && (
                  <p role="status" className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    {activeSample.analysisError}
                  </p>
                )}
                {activeSample.analyzing ? (
                  <div className="py-16 text-center space-y-3">
                    <div className="w-8 h-8 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin mx-auto" />
                    <p className="text-xs text-neutral-500">
                      Analyzing stylistic markers... Higher reasoning levels can take several minutes. You can cancel at any time.
                    </p>
                  </div>
                ) : activeSample.analysis ? (
                  <div className="space-y-6">
                    {/* Summary */}
                    <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-100 text-neutral-800 text-xs leading-relaxed">
                      <span className="font-medium text-neutral-900 block mb-0.5">
                        Analysis summary
                      </span>
                      {activeSample.analysis.summary}
                    </div>

                    {/* Word Choice and Rhythm */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Word Choice */}
                      <div className="p-4 rounded-lg border border-neutral-200 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-neutral-900">
                            Lexicon and register
                          </span>
                          <span className="text-neutral-500 font-mono">
                            Sensory: {activeSample.analysis.wordChoice.sensoryRichness}%
                          </span>
                        </div>

                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="text-neutral-400 block text-[11px]">Register</span>
                            <span className="font-medium text-neutral-800">
                              {activeSample.analysis.wordChoice.vocabularyLevel}
                            </span>
                          </div>

                          <div>
                            <span className="text-neutral-400 block text-[11px] mb-1">Registers</span>
                            <div className="flex flex-wrap gap-1">
                              {activeSample.analysis.wordChoice.favoredRegisters.map((reg, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 text-[11px]"
                                >
                                  {reg}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div>
                            <span className="text-neutral-400 block text-[11px] mb-1">Avoided patterns</span>
                            <div className="flex flex-wrap gap-1">
                              {activeSample.analysis.wordChoice.avoidedPatterns.map((pat, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 text-[11px]"
                                >
                                  ✕ {pat}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Rhythm and Cadence */}
                      <div className="p-4 rounded-lg border border-neutral-200 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-neutral-900">
                            Cadence and rhythm
                          </span>
                          <span className="text-neutral-500 font-mono">
                            Burstiness: {activeSample.analysis.rhythmAndPacing.burstinessScore}%
                          </span>
                        </div>

                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="text-neutral-400 block text-[11px]">Cadence</span>
                            <p className="text-neutral-800 leading-relaxed">
                              {activeSample.analysis.rhythmAndPacing.cadence}
                            </p>
                          </div>

                          <div>
                            <span className="text-neutral-400 block text-[11px]">Paragraph flow</span>
                            <p className="text-neutral-700">
                              {activeSample.analysis.rhythmAndPacing.paragraphLength}
                            </p>
                          </div>

                          <div>
                            <span className="text-neutral-400 block text-[11px]">Transitions</span>
                            <p className="text-neutral-700">
                              {activeSample.analysis.rhythmAndPacing.transitionStyle}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sentence Structure */}
                    <div className="p-4 rounded-lg border border-neutral-200 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-neutral-900">
                          Sentence structure
                        </span>
                        <span className="text-neutral-500 font-mono">
                          Mean length: {activeSample.analysis.sentenceStructure.avgSentenceLength} words
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="p-2.5 rounded-md bg-neutral-50 border border-neutral-100 text-center">
                          <span className="text-[11px] text-neutral-500 block">Under 10 words</span>
                          <span className="text-base font-semibold text-neutral-900 font-mono">
                            {activeSample.analysis.sentenceStructure.lengthDistribution.shortUnder10}%
                          </span>
                        </div>
                        <div className="p-2.5 rounded-md bg-neutral-50 border border-neutral-100 text-center">
                          <span className="text-[11px] text-neutral-500 block">10 to 25 words</span>
                          <span className="text-base font-semibold text-neutral-900 font-mono">
                            {activeSample.analysis.sentenceStructure.lengthDistribution.medium10to25}%
                          </span>
                        </div>
                        <div className="p-2.5 rounded-md bg-neutral-50 border border-neutral-100 text-center">
                          <span className="text-[11px] text-neutral-500 block">Over 25 words</span>
                          <span className="text-base font-semibold text-neutral-900 font-mono">
                            {activeSample.analysis.sentenceStructure.lengthDistribution.longOver25}%
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-neutral-100 text-xs">
                        <div className="p-2 rounded bg-neutral-50">
                          <span className="text-neutral-400 block text-[10px]">Em-dashes</span>
                          <span className="font-medium text-neutral-800 capitalize">
                            {activeSample.analysis.sentenceStructure.punctuationSignatures.emDashes}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-neutral-50">
                          <span className="text-neutral-400 block text-[10px]">Semicolons</span>
                          <span className="font-medium text-neutral-800 capitalize">
                            {activeSample.analysis.sentenceStructure.punctuationSignatures.semicolons}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-neutral-50">
                          <span className="text-neutral-400 block text-[10px]">Fragments</span>
                          <span className="font-medium text-neutral-800 capitalize">
                            {activeSample.analysis.sentenceStructure.punctuationSignatures.fragments}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-neutral-50">
                          <span className="text-neutral-400 block text-[10px]">Active voice</span>
                          <span className="font-medium text-neutral-800 font-mono">
                            {activeSample.analysis.sentenceStructure.activeVoicePercentage}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Authorial Voice and Tone */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Voice */}
                      <div className="p-4 rounded-lg border border-neutral-200 space-y-2">
                        <span className="text-xs font-medium text-neutral-900 block">
                          Authorial voice
                        </span>
                        <div className="space-y-1.5 text-xs">
                          <div>
                            <span className="text-neutral-400 block text-[11px]">Persona</span>
                            <p className="font-medium text-neutral-900">
                              {activeSample.analysis.voice.persona}
                            </p>
                          </div>
                          <div>
                            <span className="text-neutral-400 block text-[11px]">Perspective</span>
                            <span className="font-medium text-neutral-800 capitalize">
                              {activeSample.analysis.voice.perspective.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-1 text-neutral-600 font-mono text-[11px]">
                            <span>Intimacy: {activeSample.analysis.voice.intimacy}%</span>
                            <span>Irony: {activeSample.analysis.voice.ironyLevel}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Tone */}
                      <div className="p-4 rounded-lg border border-neutral-200 space-y-2">
                        <span className="text-xs font-medium text-neutral-900 block">
                          Tone and resonance
                        </span>
                        <div className="space-y-1.5 text-xs">
                          <div>
                            <span className="text-neutral-400 block text-[11px]">Resonance</span>
                            <p className="text-neutral-800">
                              {activeSample.analysis.tone.emotionalResonance}
                            </p>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 pt-1 text-center font-mono">
                            <div className="bg-neutral-50 p-1.5 rounded">
                              <span className="text-[10px] text-neutral-400 block">Formality</span>
                              <span className="font-medium text-neutral-800 text-xs">
                                {activeSample.analysis.tone.formalityScore}%
                              </span>
                            </div>
                            <div className="bg-neutral-50 p-1.5 rounded">
                              <span className="text-[10px] text-neutral-400 block">Warmth</span>
                              <span className="font-medium text-neutral-800 text-xs">
                                {activeSample.analysis.tone.warmthScore}%
                              </span>
                            </div>
                            <div className="bg-neutral-50 p-1.5 rounded">
                              <span className="text-[10px] text-neutral-400 block">Confidence</span>
                              <span className="font-medium text-neutral-800 text-xs">
                                {activeSample.analysis.tone.confidenceScore}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Derived Rules */}
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-neutral-900 block">
                        Derived rules ({activeSample.analysis.rules.length})
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {activeSample.analysis.rules.map((rule, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 p-2.5 rounded-lg bg-neutral-50 border border-neutral-100 text-xs text-neutral-800"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{rule}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Notable Excerpts */}
                    {activeSample.analysis.notableExcerpts &&
                      activeSample.analysis.notableExcerpts.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <span className="text-xs font-medium text-neutral-900 block">
                            Notable excerpts
                          </span>
                          <div className="space-y-2">
                            {activeSample.analysis.notableExcerpts.map((ex, i) => (
                              <div
                                key={i}
                                className="p-3 rounded-lg border border-neutral-200 bg-neutral-50/50 space-y-1"
                              >
                                <blockquote className="text-xs italic text-neutral-900 leading-relaxed">
                                  "{ex.quote}"
                                </blockquote>
                                <p className="text-[11px] text-neutral-500">
                                  {ex.commentary}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Bottom Navigation */}
                    <div className="pt-4 border-t border-neutral-100 flex items-center justify-between">
                      <span className="text-xs text-neutral-400">
                        Active in voice blueprint
                      </span>
                      <button
                        onClick={() => setActiveTab('profile')}
                        className="flex items-center gap-1.5 text-xs font-medium text-neutral-900 hover:text-neutral-700"
                      >
                        <span>Continue to Voice Blueprint</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center space-y-3">
                    <p className="text-xs text-neutral-500">
                      Your sample is ready to use. Analyze it to see a style breakdown.
                    </p>
                    <button
                      onClick={() => analyzeSample(activeSample.id)}
                      className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-medium"
                    >
                      Analyze sample
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-neutral-200 p-12 text-center space-y-2">
                <FileText className="w-8 h-8 text-neutral-300 mx-auto" />
                <h3 className="text-sm font-medium text-neutral-900">Select a document</h3>
              </div>
            )}
          </div>
        </div>
      )}

      <UploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
      <DeleteConfirmModal
        isOpen={!!sampleToDelete}
        sample={sampleToDelete}
        onClose={() => setSampleToDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};
