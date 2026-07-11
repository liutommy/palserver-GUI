import getWorldSettingsByServerId from './getWorldSettingsByServerId';
import setWorldSettingsiniByServerId from './setWorldSettingsiniByServerId';
import trimWorldSettingsString from '../../../utils/trimWorldSettingsString';

export type EnsureRestApiResult = {
  ready: boolean;
  changed: boolean;
  reason?: 'NO_INI' | 'NO_ADMIN_PASSWORD';
};

/**
 * watchdog 的掛起偵測與優雅關機依賴官方 REST API。
 * 舊格式的 PalWorldSettings.ini 完全沒有 RESTAPIEnabled 欄位,
 * 這裡在開服前補上缺少的鍵 (寫在 spawn 之前,伺服器開機即生效)。
 * REST 走 HTTP Basic (admin/AdminPassword),密碼為空時不啟用。
 */
export default async function ensureRestApiEnabled(
  serverId: string,
): Promise<EnsureRestApiResult> {
  const worldSettings = await getWorldSettingsByServerId(serverId);
  if (!worldSettings || Object.keys(worldSettings).length === 0) {
    return { ready: false, changed: false, reason: 'NO_INI' };
  }

  const adminPassword = trimWorldSettingsString(
    worldSettings.AdminPassword || '',
  );
  if (!adminPassword) {
    return { ready: false, changed: false, reason: 'NO_ADMIN_PASSWORD' };
  }

  const enabled = worldSettings.RESTAPIEnabled === true;
  const hasPort =
    worldSettings.RESTAPIPort !== undefined &&
    worldSettings.RESTAPIPort !== null &&
    worldSettings.RESTAPIPort !== '';

  if (enabled && hasPort) {
    return { ready: true, changed: false };
  }

  const next = {
    ...worldSettings,
    RESTAPIEnabled: true,
    RESTAPIPort: hasPort ? worldSettings.RESTAPIPort : 8212,
  };
  await setWorldSettingsiniByServerId(serverId, next);
  return { ready: true, changed: true };
}
