import { describe, it, expect } from 'vitest';
import { isLastDone, isLastError, getPlainEnglish, type ProgressLine } from './progressSummary';

describe('getPlainEnglish', () => {
  it('returns the approval message when a plan is pending', () => {
    const lines: ProgressLine[] = [{ text: 'Creating Hero.tsx', status: 'done' }];
    expect(getPlainEnglish(lines, true)).toBe('Esperando tu aprobación...');
  });

  it('returns the generic fallback when lines is empty', () => {
    expect(getPlainEnglish([], false)).toBe('Working on it...');
  });

  it('returns the planning message for a pending "Planning..." line', () => {
    const lines: ProgressLine[] = [{ text: 'Planning...', status: 'pending' }];
    expect(getPlainEnglish(lines, false)).toBe('Figuring out what to build...');
  });

  it('recognizes the planning line by its kind, whatever language its text is in', () => {
    const lines: ProgressLine[] = [{ text: 'Planeando...', status: 'pending', kind: 'planning' }];
    expect(getPlainEnglish(lines, false)).toBe('Figuring out what to build...');
  });

  it('returns the creating message for a pending line with currentAction "create"', () => {
    const lines: ProgressLine[] = [{ text: 'Creating Hero.tsx', status: 'pending' }];
    expect(getPlainEnglish(lines, false, 'create')).toBe('Writing new components...');
  });

  it('returns the updating message for a pending line with currentAction "modify"', () => {
    const lines: ProgressLine[] = [{ text: 'Updating Hero.tsx', status: 'pending' }];
    expect(getPlainEnglish(lines, false, 'modify')).toBe('Updating existing files...');
  });

  it('returns the deleting message for a pending line with currentAction "delete"', () => {
    const lines: ProgressLine[] = [{ text: 'Deleting Hero.tsx', status: 'pending' }];
    expect(getPlainEnglish(lines, false, 'delete')).toBe('Removing files...');
  });

  it('returns the done message for a done line', () => {
    const lines: ProgressLine[] = [{ text: 'Modified Hero.tsx', status: 'done' }];
    expect(getPlainEnglish(lines, false)).toBe('All done ✓');
  });

  it('prefers the pending line over the last line when both exist', () => {
    const lines: ProgressLine[] = [
      { text: 'Deleting Hero.tsx', status: 'pending' },
      { text: 'Creating Footer.tsx', status: 'done' },
    ];
    expect(getPlainEnglish(lines, false, 'delete')).toBe('Removing files...');
  });

  it('treats an error line as NOT the last-done line', () => {
    expect(isLastDone([{ text: 'Updating Hero.tsx', status: 'error' }])).toBe(false);
  });

  it('reports an errored line as isLastError', () => {
    expect(isLastError([{ text: 'Updating Hero.tsx', status: 'error' }])).toBe(true);
  });

  it('reports an errored line as "Something went wrong"', () => {
    expect(
      getPlainEnglish([{ text: 'Updating Hero.tsx', status: 'error' }], false)
    ).toBe('Something went wrong');
  });

  it('reports "Fixing a small issue..." while retrying with pending lines', () => {
    const lines: ProgressLine[] = [{ text: 'Fixing compile error (attempt 1/3)...', status: 'pending' }];
    expect(getPlainEnglish(lines, false, undefined, true)).toBe('Fixing a small issue...');
  });

  it('lets error win over a retry that ultimately failed', () => {
    const lines: ProgressLine[] = [{ text: 'Fixing compile error (attempt 3/3)...', status: 'error' }];
    expect(getPlainEnglish(lines, false, undefined, true)).toBe('Something went wrong');
  });

  it('does not let an orphaned pending line in the middle of the array hijack the header when the run ended in error', () => {
    const lines: ProgressLine[] = [
      { text: 'Creating Hero.tsx', status: 'done' },
      { text: 'Updating Footer.tsx', status: 'pending' },
      { text: 'Updating Nav.tsx', status: 'pending' },
      { text: 'Deleting Old.tsx', status: 'error' },
    ];
    expect(getPlainEnglish(lines, false)).toBe('Something went wrong');
  });
});
