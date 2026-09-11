import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface SelectionToolbarProps {
  container: React.RefObject<HTMLElement | null>;
  label: string;
  onAct: () => void;
  enabled: boolean;
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  container,
  label,
  onAct,
  enabled,
}) => {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [dismissedText, setDismissedText] = useState<string>('');

  const updatePosition = () => {
    if (!enabled || typeof window === 'undefined') {
      setCoords(null);
      return;
    }
    const root = container.current;
    if (!root) {
      setCoords(null);
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      setCoords(null);
      setDismissed(false);
      return;
    }
    const text = selection.toString().trim();
    if (!text) {
      setCoords(null);
      setDismissed(false);
      return;
    }

    // If text has changed since dismissal, reset dismissed
    if (dismissed && text !== dismissedText) {
      setDismissed(false);
    }

    if (dismissed && text === dismissedText) {
      setCoords(null);
      return;
    }

    try {
      const range = selection.getRangeAt(0);
      if (range.collapsed) {
        setCoords(null);
        setDismissed(false);
        return;
      }
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
        setCoords(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      const crect = root.getBoundingClientRect();
      const toolbarWidth = toolbarRef.current?.offsetWidth || 200;
      const toolbarHeight = toolbarRef.current?.offsetHeight || 38;

      // Sit clear above the selected line; drop below it when that would leave the scroll area.
      let top = rect.top - crect.top + root.scrollTop - toolbarHeight - 8;
      if (top < root.scrollTop + 4) {
        top = rect.bottom - crect.top + root.scrollTop + 8;
      }

      const minLeft = 8;
      const maxLeft = Math.max(minLeft, crect.width - toolbarWidth - 8);
      const rawLeft = rect.left - crect.left + rect.width / 2 - toolbarWidth / 2;
      const left = Math.max(minLeft, Math.min(rawLeft, maxLeft));

      setCoords({ top, left });
    } catch {
      setCoords(null);
    }
  };

  useEffect(() => {
    const root = container.current;
    const handleSelectionChange = () => {
      updatePosition();
    };
    const handleScroll = () => {
      updatePosition();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDismissed(true);
        const sel = window.getSelection();
        setDismissedText(sel?.toString().trim() ?? '');
        setCoords(null);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('keydown', handleKeyDown);
    if (root) {
      root.addEventListener('scroll', handleScroll, { passive: true });
    }

    updatePosition();

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('keydown', handleKeyDown);
      if (root) {
        root.removeEventListener('scroll', handleScroll);
      }
    };
  }, [container.current, enabled, dismissed, dismissedText, label]);

  useLayoutEffect(() => {
    if (toolbarRef.current && coords && container.current) {
      const width = toolbarRef.current.offsetWidth;
      const height = toolbarRef.current.offsetHeight;
      const root = container.current;
      const crect = root.getBoundingClientRect();
      const selection = window.getSelection();
      if (selection && selection.rangeCount && !selection.isCollapsed) {
        try {
          const rect = selection.getRangeAt(0).getBoundingClientRect();
          const minLeft = 8;
          const maxLeft = Math.max(minLeft, crect.width - width - 8);
          const rawLeft = rect.left - crect.left + rect.width / 2 - width / 2;
          const left = Math.max(minLeft, Math.min(rawLeft, maxLeft));
          let top = rect.top - crect.top + root.scrollTop - height - 8;
          if (top < root.scrollTop + 4) {
            top = rect.bottom - crect.top + root.scrollTop + 8;
          }
          if (Math.abs(left - coords.left) > 1 || Math.abs(top - coords.top) > 1) {
            setCoords({ top, left });
          }
        } catch {}
      }
    }
  }, [coords?.top, coords?.left, label]);

  if (!enabled || !coords || dismissed || !label) {
    return null;
  }

  const handleActClick = () => {
    setDismissed(true);
    const sel = window.getSelection();
    setDismissedText(sel?.toString().trim() ?? '');
    setCoords(null);
    onAct();
  };

  return (
    <div
      ref={toolbarRef}
      role="toolbar"
      aria-label="Selected text"
      className="studio-selection-toolbar"
      style={{
        position: 'absolute',
        top: `${coords.top}px`,
        left: `${coords.left}px`,
      }}
      onMouseDown={e => e.preventDefault()}
    >
      <button
        type="button"
        className="studio-text-button"
        onMouseDown={e => e.preventDefault()}
        onClick={handleActClick}
      >
        {label}
      </button>
    </div>
  );
};
