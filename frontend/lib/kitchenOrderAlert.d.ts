import type { KitchenOrderResponse } from "./types";

export const KITCHEN_ORDER_ALERT_PATH: string;

export class NewKitchenTicketTracker {
  observe(orders: KitchenOrderResponse[]): boolean;
}

export class KitchenOrderAlert {
  constructor(options?: {
    src?: string;
    cooldownMs?: number;
    createAudio?: () => HTMLAudioElement;
    now?: () => number;
    onFailure?: (error: unknown) => void;
  });
  preload(): HTMLAudioElement | null;
  unlock(): Promise<void>;
  play(): boolean;
  dispose(): void;
}
