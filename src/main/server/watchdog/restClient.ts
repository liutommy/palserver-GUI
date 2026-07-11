import axios from 'axios';
import getWorldSettingsByServerId from '../../services/worldSettings/getWorldSettingsByServerId';
import trimWorldSettingsString from '../../../utils/trimWorldSettingsString';

/**
 * 對本機伺服器的官方 REST API 發送請求。
 * 與 sendRestAPI IPC 不同,這裡強制帶 timeout —
 * watchdog 的存活探測不能被掛住的伺服器卡死。
 */
export default async function restRequest(
  serverId: string,
  api: string,
  options: { method?: string; body?: any; timeoutMs?: number } = {},
) {
  const worldSettings = await getWorldSettingsByServerId(serverId);
  const port = worldSettings.RESTAPIPort || 8212;
  const result = await axios(`http://127.0.0.1:${port}/v1/api${api}`, {
    method: (options.method as any) || 'get',
    auth: {
      username: 'admin',
      password: trimWorldSettingsString(worldSettings.AdminPassword),
    },
    data: options.body,
    timeout: options.timeoutMs ?? 5000,
  });
  return result.data;
}
