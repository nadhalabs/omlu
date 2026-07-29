"use client";

import { useState } from "react";
import { staffLogout } from "@/lib/api";
import { useOmluUi } from "@/components/OmluUiProvider";

export function useConfirmedSignOut() {
  const { confirm: confirmDialog, toast } = useOmluUi();
  const [pending, setPending] = useState(false);

  const requestSignOut = async () => {
    if (pending) return;
    setPending(true);
    try {
      await confirmDialog({
        title: "Sign out?",
        message: "Are you sure you want to sign out of OMLU?",
        confirmLabel: "Sign Out",
        cancelLabel: "Cancel",
        tone: "destructive",
        onConfirm: async () => {
          try {
            await staffLogout();
          } catch {
            toast("Failed to sign out. Please try again.", "error");
            throw new Error("Failed to sign out. Please try again.");
          }
        },
      });
    } finally {
      setPending(false);
    }
  };

  return { requestSignOut, signOutPending: pending };
}
