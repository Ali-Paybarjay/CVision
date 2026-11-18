import { approveOnePerLine } from "@/features/tailor/tailored-cv";
import type { TailoringChange } from "@/shared/contracts";

/** The last approval that sent an earlier change to the same line back, so both cards can say so (#465). */
export type LineNotes = { approved: string; sentBack: string[] } | null;

/**
 * The page's changes after one decision, the changes to save, and the line notes after it. Only one change per CV line:
 * approving a second one sends the earlier one back to the suggestions (#272). Undo on that second one, before any
 * other decision, approves the earlier one again, so the line is as it was before the decision (#531).
 */
export function decideOnLine(
  current: TailoringChange[],
  next: TailoringChange,
  notes: LineNotes,
): { changes: TailoringChange[]; toSave: TailoringChange[]; notes: LineNotes } {
  const restored =
    next.status === "proposed" && notes?.approved === next.id
      ? current
          .filter((change) => notes.sentBack.includes(change.id) && change.status === "proposed")
          .map((change) => ({ ...change, status: "approved" as const }))
      : [];
  const { changes, sentBack } = approveOnePerLine(current, next);
  return {
    changes: changes.map((change) => restored.find((item) => item.id === change.id) ?? change),
    toSave: [next, ...sentBack, ...restored],
    notes: sentBack.length > 0 ? { approved: next.id, sentBack: sentBack.map((change) => change.id) } : null,
  };
}
