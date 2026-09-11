import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { inlineText, parseInline, plainText, RichParagraph } from '../src/utils/richText';

const render = (text: string) => renderToStaticMarkup(createElement(RichParagraph, { text, id: 'draft-paragraph-1', className: 'studio-source-paragraph' }));

test('inline marks become formatting and never appear as characters', () => {
  const nodes = parseInline('Use **bold**, *italic*, _also italic_, `code`, ~~gone~~ and [a link](https://example.com).');
  assert.deepEqual(nodes.map((node) => node.kind), ['text', 'strong', 'text', 'em', 'text', 'em', 'text', 'code', 'text', 'del', 'text', 'link', 'text']);
  assert.equal(inlineText(nodes), 'Use bold, italic, also italic, code, gone and a link.');
  // Underscores inside identifiers and asterisks used as multiplication are not emphasis.
  assert.equal(inlineText(parseInline('snake_case_name and 3 * 4 * 5')), 'snake_case_name and 3 * 4 * 5');
  // An escaped mark stays literal, without its backslash.
  assert.equal(inlineText(parseInline('a \\*literal\\* star')), 'a *literal* star');
});

test('plainText strips block marks but keeps the line structure a reader sees', () => {
  assert.equal(plainText('# Tailoring upgrade prompts'), 'Tailoring upgrade prompts');
  assert.equal(plainText('- first\n- **second**\n> quoted'), '• first\n• second\nquoted');
  assert.equal(plainText('Plain text with no marks.'), 'Plain text with no marks.');
  assert.equal(plainText('---'), '');
});

test('RichParagraph renders each block form while keeping the paragraph id and class', () => {
  assert.equal(render('# Title'), '<h2 id="draft-paragraph-1" class="studio-source-paragraph studio-heading">Title</h2>');
  assert.equal(render('### Deeper **title**'), '<h3 id="draft-paragraph-1" class="studio-source-paragraph studio-heading">Deeper <strong>title</strong></h3>');
  assert.equal(render('- one\n- two\ncontinued'), '<ul id="draft-paragraph-1" class="studio-source-paragraph"><li>one</li><li>two<br/>continued</li></ul>');
  assert.equal(render('2. second\n3. third'), '<ol id="draft-paragraph-1" class="studio-source-paragraph" start="2"><li>second</li><li>third</li></ol>');
  assert.equal(render('> a quote'), '<blockquote id="draft-paragraph-1" class="studio-source-paragraph">a quote</blockquote>');
  assert.equal(render('***'), '<hr id="draft-paragraph-1" class="studio-source-paragraph"/>');
  assert.equal(render('Just *prose* here.'), '<p id="draft-paragraph-1" class="studio-source-paragraph">Just <em>prose</em> here.</p>');
  // A heading line that shares a paragraph with its first sentence reads as a bold lead line.
  assert.equal(render('## Lead\nThen a sentence.'), '<p id="draft-paragraph-1" class="studio-source-paragraph"><strong>Lead</strong><br/>Then a sentence.</p>');
  // Links open elsewhere and never run scripts: rendered as anchors with the text shown.
  assert.equal(render('See [docs](https://example.com/x).'), '<p id="draft-paragraph-1" class="studio-source-paragraph">See <a href="https://example.com/x" target="_blank" rel="noreferrer">docs</a>.</p>');
});
