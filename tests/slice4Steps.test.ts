import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StepFooter } from '../src/components/StepFooter';
import { DomainProductsSection } from '../src/components/DomainProductsSection';
import { DomainTopicsSection } from '../src/components/DomainTopicsSection';
import { DomainExpertise, DomainTopic } from '../src/types';
import { normalizeDomainExpertise } from '../src/writingPipeline';

function makeExpertise(partial: Partial<DomainExpertise> = {}): DomainExpertise {
  return normalizeDomainExpertise({
    field: 'UX Copywriting',
    disciplines: ['UX Copywriting'],
    topics: [],
    productKnowledge: [],
    keyTerminology: [],
    conventions: [],
    audienceContext: '',
    enabled: true,
    ...partial,
  });
}

test('StepFooter renders a single white button right-aligned with the expected id and label', () => {
  const html = renderToStaticMarkup(
    createElement(StepFooter, {
      id: 'btn-test-footer',
      label: 'Next: Voice Blueprint →',
      onClick: () => {},
    }),
  );

  assert.match(html, /id="btn-test-footer"/);
  assert.match(html, /Next: Voice Blueprint →/);
  assert.match(html, /bg-white/);
  assert.match(html, /border-neutral-200/);
  assert.match(html, /justify-end/);
});

test('DomainTopicsSection empty state renders Generate topics once and draft/brief checkbox beside it', () => {
  const emptyExpertise = makeExpertise({
    topics: [],
  });

  const html = renderToStaticMarkup(
    createElement(DomainTopicsSection, {
      localExpertise: emptyExpertise,
      saveExpertise: () => {},
      updateDomainExpertise: () => {},
      flashSaved: () => {},
      modelSettings: {},
      draftText: '',
      projectBrief: '',
      sourceUploadPending: false,
      useDraftAndBrief: false,
      setUseDraftAndBrief: () => {},
      onEditDraftBrief: () => {},
    }),
  );

  // Generate topics button appears
  assert.match(html, /id="btn-regenerate-topics"/);
  assert.match(html, /Generate topics/);
  // Checkbox appears
  assert.match(html, /id="checkbox-use-draft-brief"/);
  // Exactly one Generate topics button in output
  const matches = html.match(/id="btn-regenerate-topics"/g);
  assert.equal(matches?.length, 1);
  // No Clear all topics button in empty state
  assert.doesNotMatch(html, /id="btn-clear-topics"/);
});

test('DomainTopicsSection with topics renders Regenerate topics primary, rose Clear all topics, and no +N more truncation', () => {
  const sampleTopic: DomainTopic = {
    id: 'topic-1',
    name: 'Growth Design',
    category: 'discipline',
    keyTerminology: ['funnel', 'cohort', 'conversion'],
    conventions: ['Rule 1', 'Rule 2', 'Rule 3', 'Rule 4'],
    enabled: true,
  };

  const expertiseWithTopics = makeExpertise({
    topics: [sampleTopic],
  });

  const html = renderToStaticMarkup(
    createElement(DomainTopicsSection, {
      localExpertise: expertiseWithTopics,
      saveExpertise: () => {},
      updateDomainExpertise: () => {},
      flashSaved: () => {},
      modelSettings: {},
      draftText: '',
      projectBrief: '',
      sourceUploadPending: false,
      useDraftAndBrief: false,
      setUseDraftAndBrief: () => {},
      onEditDraftBrief: () => {},
    }),
  );

  // Regenerate topics primary
  assert.match(html, /id="btn-regenerate-topics"/);
  assert.match(html, /Regenerate topics/);
  // Clear all topics button present
  assert.match(html, /id="btn-clear-topics"/);
  assert.match(html, /text-rose-600/);
  // Summary line shows counts
  assert.match(html, /3 concepts · 4 conventions/);
  // All conventions rendered without +N more
  assert.match(html, /Rule 1/);
  assert.match(html, /Rule 2/);
  assert.match(html, /Rule 3/);
  assert.match(html, /Rule 4/);
  assert.doesNotMatch(html, /more rules/);
  assert.doesNotMatch(html, /\+ \d+ more/);
});

test('DomainProductsSection renders Add product once in empty state and Remove button per product', () => {
  const emptyExpertise = makeExpertise({
    productKnowledge: [],
  });

  const emptyHtml = renderToStaticMarkup(
    createElement(DomainProductsSection, {
      localExpertise: emptyExpertise,
      saveExpertise: () => {},
    }),
  );

  // Only one Add product button in empty state
  const emptyMatches = emptyHtml.match(/id="btn-add-product"/g);
  assert.equal(emptyMatches?.length, 1);

  const populatedExpertise = makeExpertise({
    productKnowledge: [
      { id: 'prod-1', name: 'Translator', notes: 'Translates text', enabled: true },
    ],
  });

  const populatedHtml = renderToStaticMarkup(
    createElement(DomainProductsSection, {
      localExpertise: populatedExpertise,
      saveExpertise: () => {},
    }),
  );

  // Add product button in header
  assert.match(populatedHtml, /id="btn-add-product"/);
  // Remove button per product with rose text styling
  assert.match(populatedHtml, /id="btn-delete-product-prod-1"/);
  assert.match(populatedHtml, /text-rose-600/);
});

test('Domain sections dim with opacity-50 when the master switch is off, without aria-disabled (controls stay operable)', () => {
  const disabledExpertise = makeExpertise({
    enabled: false,
  });

  const topicsHtml = renderToStaticMarkup(
    createElement(DomainTopicsSection, {
      localExpertise: disabledExpertise,
      saveExpertise: () => {},
      updateDomainExpertise: () => {},
      flashSaved: () => {},
      modelSettings: {},
      draftText: '',
      projectBrief: '',
      sourceUploadPending: false,
      useDraftAndBrief: false,
      setUseDraftAndBrief: () => {},
      onEditDraftBrief: () => {},
    }),
  );

  // aria-disabled on a wrapper is inherited by every descendant in the accessibility
  // tree, which would announce live controls as unavailable.
  assert.doesNotMatch(topicsHtml, /aria-disabled/);
  assert.match(topicsHtml, /opacity-50/);

  const productsHtml = renderToStaticMarkup(
    createElement(DomainProductsSection, {
      localExpertise: disabledExpertise,
      saveExpertise: () => {},
    }),
  );

  assert.doesNotMatch(productsHtml, /aria-disabled/);
  assert.match(productsHtml, /opacity-50/);
});
