export type KitchenMode = "kds" | "direct_print";

export function kitchenCapabilities(mode: KitchenMode) {
  const usesKds = mode === "kds";
  return {
    usesKds,
    usesDirectKitchenPrint: !usesKds,
    customerSelfCancellationAllowed: usesKds,
    showLiveKitchenProgress: usesKds,
  } as const;
}
