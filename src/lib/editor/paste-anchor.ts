import { absolutePositionToRelativePosition } from "y-prosemirror";
import * as Y from "yjs";

/**
 * A position in the shared document that stays just after the character before `pos`.
 * Text typed at that spot afterwards (by anyone) then goes after the anchor, so a
 * citation pasted there lands before it, where the link was pasted. y-prosemirror's own
 * anchor holds on to the character after instead, which slides it past the new text.
 */
export function anchorBefore(pos: number, type: Y.XmlFragment, doc: Y.Doc, mapping: Map<unknown, unknown>) {
  const rel = absolutePositionToRelativePosition(pos, type, mapping as never);
  const abs = Y.createAbsolutePositionFromRelativePosition(rel, doc);
  if (!abs || abs.index === 0 || !(abs.type instanceof Y.XmlText)) return rel;
  return Y.createRelativePositionFromTypeIndex(abs.type, abs.index, -1);
}
