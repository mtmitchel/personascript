import assert from 'node:assert/strict';
import test from 'node:test';
import { SUPPORTED_SAMPLE_EXTENSIONS } from '../src/utils/sampleFiles';

test('SUPPORTED_SAMPLE_EXTENSIONS includes only pdf, docx, md, txt', () => {
  assert.deepEqual(SUPPORTED_SAMPLE_EXTENSIONS, ['pdf', 'docx', 'md', 'txt']);
});
