import type { PrepDocumentKind } from "@/types";

/**
 * Tiny in-process notification so an open prep panel reloads when the same document
 * is generated elsewhere (e.g. the quick study plan generating a missing round pack).
 */
export interface PrepDocumentChange {
  applicationId: string;
  kind: PrepDocumentKind;
  interviewId: string;
}

type Listener = (change: PrepDocumentChange) => void;
const listeners = new Set<Listener>();

export function onPrepDocumentChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitPrepDocumentChanged(change: PrepDocumentChange): void {
  for (const l of listeners) l(change);
}
