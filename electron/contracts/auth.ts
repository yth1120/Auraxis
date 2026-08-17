/**
 * auth.ts — local account / login contract (single source of truth).
 *
 * Auraxis ships with a local-first account system: the first launch creates
 * a local account (password stored as a salted scrypt hash), later launches
 * require login unless "remember me" is set. There is no cloud backend yet —
 * the IPC surface is deliberately small so a remote provider can replace the
 * auth-store implementation without touching the renderer.
 */

export type AuthPhase = 'setup' | 'locked' | 'unlocked';

export interface AuthStatus {
  phase: AuthPhase;
  /** Account display name (only when an account exists). */
  name?: string;
  /** Normalized account email. */
  email?: string;
  /** Custom avatar as a data URL (optional; falls back to initials). */
  avatar?: string;
  /** Whether login should survive app restarts. */
  rememberMe: boolean;
}

export interface AuthSetupParams {
  name: string;
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface AuthLoginParams {
  email: string;
  password: string;
  rememberMe: boolean;
}

export interface AuthChangePasswordParams {
  currentPassword: string;
  newPassword: string;
}
