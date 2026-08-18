import { ipcMain } from 'electron';
import { getAuthStatus, setupAccount, loginAccount, logoutAccount, changeAccountPassword, setAccountAvatar, changeAccountName } from '../auth-store';
import type { AuthChangeNameParams, AuthChangePasswordParams, AuthLoginParams, AuthSetupParams } from '../contracts/auth';

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:status', async () => {
    try {
      return { ok: true, data: await getAuthStatus() };
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  });

  ipcMain.handle('auth:setup', async (_event, params: AuthSetupParams) => {
    try {
      return await setupAccount(params ?? {});
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  });

  ipcMain.handle('auth:login', async (_event, params: AuthLoginParams) => {
    try {
      return await loginAccount(params ?? {});
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      await logoutAccount();
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  });

  ipcMain.handle('auth:changePassword', async (_event, params: AuthChangePasswordParams) => {
    try {
      return await changeAccountPassword(params ?? {});
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  });

  ipcMain.handle('auth:setAvatar', async (_event, avatar: string) => {
    try {
      return await setAccountAvatar(avatar);
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  });

  ipcMain.handle('auth:changeName', async (_event, params: AuthChangeNameParams) => {
    try {
      return await changeAccountName(params ?? {});
    } catch (error: any) {
      return { ok: false, error: error?.message ?? String(error) };
    }
  });
}
