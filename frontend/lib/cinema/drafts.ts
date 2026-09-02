import type { CinemaScreen } from "./types";

/** Stores draft seat positions that differ from the server baseline, keyed by screen ID. */
export type ScreenDrafts = Map<string, Map<string, { layoutX: number; layoutY: number }>>;

/** Merges server-refreshed screens with local drafts, preserving unsaved positions. */
export function mergeScreensWithDrafts(serverScreens: CinemaScreen[], drafts: ScreenDrafts): CinemaScreen[] {
  return serverScreens.map((scr) => {
    const screenDraft = drafts.get(scr.id);
    if (!screenDraft || screenDraft.size === 0) return scr;
    return {
      ...scr,
      seats: scr.seats.map((seat) => {
        const draft = screenDraft.get(seat.id);
        return draft ? { ...seat, layoutX: draft.layoutX, layoutY: draft.layoutY } : seat;
      }),
    };
  });
}

/* ───────────────── Drag threshold (px²) ───────────────── */
export const DRAG_THRESHOLD = 25; // 5px movement required before treating as drag
