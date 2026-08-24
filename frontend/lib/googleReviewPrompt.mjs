/**
 * Keep the review invitation coupled to confirmed payment, not session closure
 * or any other terminal state.
 */
export function shouldShowGoogleReviewPrompt(billStatus, googleReviewUrl) {
  return billStatus === "paid" && Boolean(googleReviewUrl?.trim());
}

/** The initial access mode stays authoritative if the live URL later changes. */
export function shouldEnterPaidCompletion(enteredAsReceiptView) {
  return !enteredAsReceiptView;
}
