import { ipcMain } from 'electron';
import Channels from '../../channels';
import serverProcessManager from '../../../server/watchdog/ServerProcessManager';

ipcMain.on(Channels.execShutdownServer, async (event, serverId, processId) => {
  // manager 會先標記使用者主動停止 (watchdog 才不會把它當崩潰拉起來),
  // 再走 REST/RCON 優雅關機,最後以 taskkill /T 樹狀終止作保底 —
  // 舊實作的單一 process.kill 會讓 Shipping 子程序變孤兒
  await serverProcessManager.stop(serverId, processId);
});
