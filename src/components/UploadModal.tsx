import React, { useState, useRef, useEffect } from 'react';
import { useWritingAssistant } from '../context/WritingAssistantContext';
import { UploadCloud, FileText, X, AlertCircle, Check, Trash2, Plus, RefreshCw, Globe } from 'lucide-react';
import { FileType } from '../types';
import { WebImportTab } from './WebImportTab';
import { SUPPORTED_SAMPLE_EXTENSIONS } from '../utils/sampleFiles';

export { SUPPORTED_SAMPLE_EXTENSIONS } from '../utils/sampleFiles';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'upload' | 'paste' | 'link' | 'portfolio';
}

interface StagedFile {
  id: string;
  title: string;
  content: string;
  fileName: string;
  fileType: FileType;
  wordCount: number;
  status: 'extracting' | 'ready' | 'error';
  errorMessage?: string;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, initialMode = 'upload' }) => {
  const { addSample, modelSettings } = useWritingAssistant();
  const [mode, setMode] = useState<'upload' | 'paste' | 'link'>('upload');

  useEffect(() => {
    if (isOpen) {
      if (initialMode === 'portfolio' || initialMode === 'link') {
        setMode('link');
      } else if (initialMode === 'paste') {
        setMode('paste');
      } else {
        setMode('upload');
      }
    }
  }, [isOpen, initialMode]);
  
  // Paste mode state
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteContent, setPasteContent] = useState('');

  // Staged files for multi-file upload
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const extractFileContent = async (file: File): Promise<{ content: string; fileType: FileType }> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!SUPPORTED_SAMPLE_EXTENSIONS.includes(extension as never)) {
      throw new Error(`${file.name} is a .${extension} file. Save it as PDF, Word (.docx), Markdown, or plain text and try again.`);
    }
    let detectedType: FileType = 'txt';
    if (extension === 'pdf') detectedType = 'pdf';
    else if (extension === 'docx') detectedType = 'docx';
    else if (extension === 'md') detectedType = 'md';

    if (detectedType === 'pdf' || detectedType === 'docx') {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/extract-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileData: base64Data,
          fileType: detectedType,
          fileName: file.name,
          model: modelSettings.analysisModel,
          reasoningLevel: modelSettings.analysisReasoningLevel,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to extract text from ${file.name}`);
      }

      const data = await res.json();
      return { content: data.text || '', fileType: detectedType };
    } else {
      const text = await file.text();
      return { content: text, fileType: detectedType };
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    setGeneralError(null);

    // Create placeholder staged items
    const newItems: StagedFile[] = fileList.map((file) => {
      const baseTitle = file.name.replace(/\.[^/.]+$/, '');
      const extension = file.name.split('.').pop()?.toLowerCase();
      let detectedType: FileType = 'txt';
      if (extension === 'pdf') detectedType = 'pdf';
      else if (extension === 'docx') detectedType = 'docx';
      else if (extension === 'md') detectedType = 'md';

      return {
        id: `staged-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: baseTitle,
        content: '',
        fileName: file.name,
        fileType: detectedType,
        wordCount: 0,
        status: 'extracting',
      };
    });

    setStagedFiles((prev) => [...prev, ...newItems]);

    // Process each file in parallel
    fileList.forEach(async (file, idx) => {
      const targetId = newItems[idx].id;
      try {
        const { content, fileType } = await extractFileContent(file);
        const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
        setStagedFiles((prev) =>
          prev.map((item) =>
            item.id === targetId
              ? {
                  ...item,
                  content,
                  fileType,
                  wordCount,
                  status: 'ready',
                }
              : item
          )
        );
      } catch (err: any) {
        setStagedFiles((prev) =>
          prev.map((item) =>
            item.id === targetId
              ? {
                  ...item,
                  status: 'error',
                  errorMessage: err.message || 'Extraction failed',
                }
              : item
          )
        );
      }
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveStaged = (id: string) => {
    setStagedFiles((prev) => prev.filter((item) => item.id !== id));
  };

  const handleUpdateTitle = (id: string, newTitle: string) => {
    setStagedFiles((prev) =>
      prev.map((item) => (item.id === id ? { ...item, title: newTitle } : item))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (mode === 'paste') {
      if (!pasteContent.trim()) {
        setGeneralError('Please enter writing sample text.');
        return;
      }

      setIsSubmitting(true);
      try {
        const wordCount = pasteContent.trim().split(/\s+/).filter(Boolean).length;
        await addSample({
          title: pasteTitle.trim() || 'Untitled sample',
          content: pasteContent.trim(),
          fileType: 'pasted',
          wordCount,
          charCount: pasteContent.length,
        });

        setPasteTitle('');
        setPasteContent('');
        onClose();
      } catch (err: any) {
        setGeneralError(err.message || 'Failed to add sample');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Upload mode
    const erroredItems = stagedFiles.filter((item) => item.status === 'error');
    if (erroredItems.length > 0) {
      setGeneralError(
        erroredItems.length === 1
          ? `Remove “${erroredItems[0].fileName}” before adding the others.`
          : `Remove the ${erroredItems.length} files that can’t be added before adding the others.`,
      );
      return;
    }

    const readyItems = stagedFiles.filter((item) => item.status === 'ready' && item.content.trim());
    if (readyItems.length === 0) {
      setGeneralError('Please select at least one document with readable content.');
      return;
    }

    setIsSubmitting(true);

    try {
      const added: string[] = [];
      const failed: Array<{ item: StagedFile; error: string }> = [];

      for (let i = 0; i < readyItems.length; i++) {
        const item = readyItems[i];
        setSubmitProgress(`Adding sample ${i + 1} of ${readyItems.length}...`);
        try {
          await addSample({
            title: item.title.trim() || item.fileName || 'Untitled sample',
            content: item.content.trim(),
            fileType: item.fileType,
            fileName: item.fileName,
            wordCount: item.wordCount,
            charCount: item.content.length,
          });
          added.push(item.id);
        } catch (err: any) {
          failed.push({ item, error: err.message || 'Failed to add sample' });
        }
      }

      if (failed.length > 0) {
        setStagedFiles(prev => prev.filter(f => failed.some(fail => fail.item.id === f.id)).map(f => {
          const failure = failed.find(fail => fail.item.id === f.id);
          return failure ? { ...f, status: 'error' as const, errorMessage: failure.error } : f;
        }));
        setGeneralError(`Could not add ${failed.length} ${failed.length === 1 ? 'sample' : 'samples'}.`);
      } else {
        setStagedFiles([]);
        onClose();
      }
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to add samples');
    } finally {
      setIsSubmitting(false);
      setSubmitProgress(null);
    }
  };

  const handleImportPortfolioSamples = async (
    items: Array<{
      title: string;
      content: string;
      fileType: FileType;
      fileName?: string;
      wordCount: number;
      charCount: number;
    }>
  ) => {
    setIsSubmitting(true);
    setGeneralError(null);
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setSubmitProgress(`Adding sample ${i + 1} of ${items.length}...`);
        await addSample({
          title: item.title.trim() || item.fileName || 'Portfolio piece',
          content: item.content.trim(),
          fileType: item.fileType,
          fileName: item.fileName,
          wordCount: item.wordCount,
          charCount: item.charCount,
        });
      }
      onClose();
    } catch (err: any) {
      setGeneralError(err.message || 'Failed to import portfolio samples');
    } finally {
      setIsSubmitting(false);
      setSubmitProgress(null);
    }
  };

  const isExtractingAny = stagedFiles.some((f) => f.status === 'extracting');
  const readyCount = stagedFiles.filter((f) => f.status === 'ready').length;
  const pasteWordCount = pasteContent.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        id="upload-modal-container"
        className="bg-white rounded-xl shadow-xl max-w-xl w-full border border-neutral-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100">
          <h3 className="text-sm font-semibold text-neutral-900">
            Add writing samples
          </h3>
          <button
            onClick={onClose}
            aria-label="Close add writing samples"
            className="p-1 text-neutral-400 hover:text-neutral-700 rounded transition disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-neutral-100 px-5 pt-1 bg-neutral-50/50 gap-1">
          <button
            id="tab-upload-file"
            type="button"
            onClick={() => setMode('upload')}
            className={`pb-2.5 px-2.5 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
              mode === 'upload'
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload files</span>
          </button>
          <button
            id="tab-web-link"
            type="button"
            onClick={() => setMode('link')}
            className={`pb-2.5 px-2.5 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
              mode === 'link'
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Web link</span>
          </button>
          <button
            id="tab-paste-text"
            type="button"
            onClick={() => setMode('paste')}
            className={`pb-2.5 px-2.5 text-xs font-medium border-b-2 transition flex items-center gap-1.5 ${
              mode === 'paste'
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Paste text</span>
          </button>
        </div>

        {/* Modal Body */}
        {mode === 'link' ? (
          <div className="flex-1 overflow-y-auto p-5">
            {generalError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                <span>{generalError}</span>
              </div>
            )}
            <WebImportTab
              onImportSamples={handleImportPortfolioSamples}
              isSubmitting={isSubmitting}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {generalError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
              <span>{generalError}</span>
            </div>
          )}

          {mode === 'upload' ? (
            <div className="space-y-4">
              {/* Dropzone with multiple file selection */}
              <div
                id="dropzone-file-upload"
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`border border-dashed rounded-lg p-6 text-center transition ${
                  isDragging
                    ? 'border-neutral-900 bg-neutral-50'
                    : 'border-neutral-200 hover:border-neutral-400 bg-neutral-50/50'
                }`}
              >
                <div className="flex flex-col items-center">
                  <input
                    ref={fileInputRef}
                    id="input-sample-files"
                    type="file"
                    multiple
                    accept={SUPPORTED_SAMPLE_EXTENSIONS.map(e => '.' + e).join(',')}
                    aria-describedby="dropzone-help"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleFiles(e.target.files);
                        // Clear value so the same files can be re-selected if needed
                        e.target.value = '';
                      }
                    }}
                    className="sr-only"
                  />
                  <UploadCloud className="w-6 h-6 text-neutral-400 mb-1.5" />
                  <label
                    htmlFor="input-sample-files"
                    className="px-3 py-1.5 rounded-lg border border-neutral-300 text-xs font-medium text-neutral-800 hover:bg-neutral-50 cursor-pointer"
                  >
                    Choose files
                  </label>
                  <p id="dropzone-help" className="text-xs text-neutral-600 mt-2">
                    or drop them here. PDF, Word (.docx), Markdown, or plain text.
                  </p>
                </div>
              </div>

              {/* Staged Files List */}
              {stagedFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-700">
                      Selected files ({stagedFiles.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[11px] text-neutral-600 hover:text-neutral-900 flex items-center gap-1 font-medium"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Add more files</span>
                    </button>
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
                    {stagedFiles.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-lg border border-neutral-200 bg-white flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <label htmlFor={`staged-title-${item.id}`} className="text-xs font-medium text-neutral-700 shrink-0">Title</label>
                            <input
                              id={`staged-title-${item.id}`}
                              type="text"
                              value={item.title}
                              onChange={(e) => handleUpdateTitle(item.id, e.target.value)}
                              placeholder="Sample title"
                              className="font-medium text-xs text-neutral-900 bg-transparent border-b border-transparent hover:border-neutral-300 focus:border-neutral-900 px-0.5 py-0.5 w-full truncate"
                            />
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-neutral-500">
                            <span className="font-mono">{item.fileType}</span>
                            <span>•</span>
                            <span className="truncate max-w-[140px] sm:max-w-xs">
                              {item.fileName}
                            </span>
                            {item.status === 'ready' && (
                              <>
                                <span>•</span>
                                <span className="text-neutral-600 font-mono">
                                  {item.wordCount} words
                                </span>
                              </>
                            )}
                            {item.status === 'extracting' && (
                              <>
                                <span>•</span>
                                <span className="text-neutral-500 flex items-center gap-1">
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                  Extracting...
                                </span>
                              </>
                            )}
                            {item.status === 'error' && (
                              <>
                                <span>•</span>
                                <span className="text-rose-600">
                                  {item.errorMessage || 'Error'}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveStaged(item.id)}
                          className="p-1 text-neutral-400 hover:text-neutral-700 rounded transition shrink-0"
                          title="Remove file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Paste Mode */
            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="input-sample-title" className="block text-xs font-medium text-neutral-700">
                  Title
                </label>
                <input
                  id="input-sample-title"
                  type="text"
                  value={pasteTitle}
                  onChange={(e) => setPasteTitle(e.target.value)}
                  placeholder="e.g. Essay draft, Technical memo"
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-xs text-neutral-900 focus:border-neutral-900 bg-white"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label htmlFor="textarea-sample-content" className="block text-xs font-medium text-neutral-700">
                    Content
                  </label>
                  <span className="text-[11px] text-neutral-500 font-mono">
                    {pasteWordCount} words
                  </span>
                </div>
                <textarea
                  id="textarea-sample-content"
                  rows={8}
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Paste representative writing sample..."
                  className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-xs text-neutral-900 focus:border-neutral-900 bg-white font-sans leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-neutral-100">
            <div className="text-xs text-neutral-500">
              {submitProgress && <span>{submitProgress}</span>}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 rounded-lg transition disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                id="btn-submit-sample-analysis"
                type="submit"
                disabled={
                  isSubmitting ||
                  isExtractingAny ||
                  (mode === 'paste' && !pasteContent.trim()) ||
                  (mode === 'upload' && readyCount === 0)
                }
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-neutral-900 text-white hover:bg-neutral-800 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : isExtractingAny ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Extracting files...</span>
                  </>
                ) : mode === 'upload' ? (
                  <span>
                    Add {readyCount > 1 ? `${readyCount} samples` : 'sample'}
                  </span>
                ) : (
                  <span>Add sample</span>
                )}
              </button>
            </div>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};
