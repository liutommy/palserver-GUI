import { ipcMain } from 'electron';
import Channels from '../../channels';
import serverProcessManager from '../../../server/watchdog/ServerProcessManager';

// 提供剛載入 / 重新整理的 renderer 重新同步 watchdog 狀態
ipcMain.handle(Channels.getWatchdogStatus, async (event, serverId: string) => {
  return serverProcessManager.getStatus(serverId);
});
