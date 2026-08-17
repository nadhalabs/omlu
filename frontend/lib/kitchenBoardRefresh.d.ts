export class KitchenBoardRefreshCoordinator {
  refresh(run: () => Promise<void>, options?: { queueIfActive?: boolean }): Promise<void>;
  schedule(run: () => Promise<void>, delayMs?: number): void;
  dispose(): void;
}
