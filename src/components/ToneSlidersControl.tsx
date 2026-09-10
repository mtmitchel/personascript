import React from 'react';
import { ToneAdjustments } from '../types';

interface ToneSlidersControlProps {
  adjustments: ToneAdjustments;
  onChange: (adjustments: ToneAdjustments) => void;
  onReset: () => void;
}

export const ToneSlidersControl: React.FC<ToneSlidersControlProps> = ({ adjustments, onChange, onReset }) => (
  <div id="tone-sliders-control" className="studio-settings-fields">
    <label className="studio-checkbox"><input id="toggle-tone-adjustments" type="checkbox" checked={Boolean(adjustments.enabled)}
      onChange={event => onChange({ ...adjustments, enabled: event.target.checked })}/>Adjust tone</label>
    {!adjustments.enabled && <p className="studio-field-note">Uses the tone of your writing samples.</p>}
    {adjustments.enabled && <>
      {([
        { key: 'formality', label: 'Formality', low: 'Casual', high: 'Formal' },
        { key: 'enthusiasm', label: 'Enthusiasm', low: 'Subdued', high: 'Energetic' },
        { key: 'conciseness', label: 'Length', low: 'Detailed', high: 'Concise' },
      ] as const).map(slider => <div key={slider.key} className="studio-field">
        <label htmlFor={`slider-${slider.key}`} className="studio-field-label">{slider.label}</label>
        <input id={`slider-${slider.key}`} type="range" min={0} max={100} step={5} value={adjustments[slider.key]}
          onChange={event => onChange({ ...adjustments, [slider.key]: Number(event.target.value) })}/>
        <div className="studio-tone-range"><span>{slider.low}</span><span>{slider.high}</span></div>
      </div>)}
      <button id="btn-reset-sliders" type="button" onClick={onReset} className="studio-text-button">Reset tone</button>
    </>}
  </div>
);
