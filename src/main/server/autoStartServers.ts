import path from 'path';
import fs from 'fs/promises';
import fsc from 'fs';
import { USER_SERVER_INSTANCES_PATH } from '../constant';
import getServerInfoByServerId from '../services/serverInstanceSettings/getServerInfoByServerId';
import prepareAndStartServer from './prepareAndStartServer';

/**
 * GUI 啟動時自動開啟標記了 AutoStartOnLaunch 的伺服器。
 * 搭配「開機自動啟動 (系統匣)」可達成無人值守的 watchdog。
 */
export default async function autoStartServers() {
  let instanceIds: string[] = [];
  try {
    instanceIds = await fs.readdir(USER_SERVER_INSTANCES_PATH);
  } catch (e) {
    return;
  }

  let queryPort = 27015;
  // eslint-disable-next-line no-restricted-syntax
  for (const instanceId of instanceIds) {
    try {
      if (
        !fsc.existsSync(path.join(USER_SERVER_INSTANCES_PATH, instanceId, '.pal'))
      ) {
        // eslint-disable-next-line no-continue
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const serverInfo = await getServerInfoByServerId(instanceId);
      if (!serverInfo.AutoStartOnLaunch) {
        // eslint-disable-next-line no-continue
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await prepareAndStartServer(instanceId, queryPort);
      queryPort += 1;
    } catch (e) {
      // 單一實體失敗不影響其他實體的自動啟動
    }
  }
}
