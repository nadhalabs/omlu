export type WebTenantScope = Readonly<{
  restaurant_id: number;
  actor_id: number;
  role: string;
  authority_epoch: string;
}>;

export function normalizeWebTenantScope(value: unknown): WebTenantScope;
export function activateWebTenantScope(value: unknown): WebTenantScope;
export function getActiveWebTenantScope(): WebTenantScope | null;
export function scopeFingerprint(scope?: WebTenantScope | null): string | null;
export function getAuthorityGeneration(): number;
export function isAuthorityGenerationCurrent(generation: number, fingerprint: string | null): boolean;
export function authenticatedCacheKey(feature: string, filters?: unknown): string;
export function registerAuthenticatedCleanup(callback: (reason: string) => void | Promise<void>): () => void;
export function terminateWebAuthentication(options?: {
  reason?: string;
  clearServerSession?: boolean;
  redirectTo?: string | null;
}): Promise<void>;
export function prepareForAuthentication(): Promise<void>;
export function handleAuthenticationStatus(status: number): boolean;
export function configureAuthRuntimeForTests(overrides: Record<string, unknown>): void;
export function resetAuthRuntimeForTests(): void;
