import { ipcMain } from 'electron';
import Channels from '../../channels';
import serverProcessManager from '../../../server/watchdog/ServerProcessManager';

// renderer 載入 / 重新整理時重建 isRunningServers redux 狀態
ipcMain.handle(Channels.getRunningServers, async () => {
  return serverProcessManager.getRunningServers();
});
