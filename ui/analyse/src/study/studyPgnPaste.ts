import { alert, confirm } from 'lib/view';

import type StudyCtrl from './studyCtrl';
import * as xhr from './studyXhr';

export function bindPgnPaste(ctrl: StudyCtrl) {
  let busy = false;

  document.addEventListener('paste', async e => {
    if (busy || !ctrl.isWriting() || ctrl.relay || isEditableTarget(e.target)) return;

    const text = e.clipboardData?.getData('text/plain')?.trim();
    if (!text || !looksLikePgn(text)) return;

    // todos:
    // Working pretty well. But if trying to paste eg chapter 40 into chapter 41, after 1.c4, doesn't work.
    // Paste fails between ply 0 and 4.d4 exclusive.
    // Experiment in general with pasting pgns with multiple branching points on a chapter's current pgn.
    // Also with repetitions

    e.preventDefault();
    busy = true;
    const confirmed = await confirm(
      'Paste this PGN continuation into the current study chapter?',
      'Paste PGN',
      'Cancel',
    );

    if (confirmed) pastePgn(ctrl, text).finally(() => (busy = false));
    else busy = false;
  });
}

async function pastePgn(ctrl: StudyCtrl, pgn: string): Promise<void> {
  try {
    await xhr.pastePgnContinuation(ctrl.data.id, ctrl.currentChapter().id, ctrl.ctrl.path, pgn);
  } catch (err) {
    await alert(err instanceof Error ? err.message : 'Failed to paste PGN continuation.');
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : document.activeElement;
  return !!el?.closest('input, textarea, [contenteditable="true"], .mchat__say');
}

function looksLikePgn(text: string): boolean {
  return (
    /^\s*\[[^\]]+\]/m.test(text) ||
    /(?:^|\s)\d+\.(?:\.\.)?\s*\S+/.test(text) ||
    /(?:^|\s)(?:O-O-O|O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)(?:\s|$)/.test(text)
  );
}
