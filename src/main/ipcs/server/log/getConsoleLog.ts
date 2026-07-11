import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import fsc from 'fs';
import Channels from '../../channels';
import { USER_SERVER_INSTANCES_PATH } from '../../../constant';
import resolveServerPath from '../../../services/serverInstanceSettings/resolveServerPath';

const TAIL_LIMIT = 200000;

// 讀取 watchdog 擷取的伺服器主控台輸出 (每次開服重寫);
// UE 伺服器預設不輸出 stdout,空的時候退回 Pal/Saved/Logs 的 UE 日誌
ipcMain.handle(Channels.getConsoleLog, async (event, serverId: string) => {
  try {
    const capturedPath = path.join(
      USER_SERVER_INSTANCES_PATH,
      serverId,
      'logs',
      'palserver-latest.log',
    );
    if (fsc.existsSync(capturedPath)) {
      const captured = await fs.readFile(capturedPath, { encoding: 'utf-8' });
      if (captured.trim()) return captured;
    }

    const ueLogPath = path.join(
      resolveServerPath(serverId),
      'Pal/Saved/Logs/Pal.log',
    );
    if (fsc.existsSync(ueLogPath)) {
      const content = await fs.readFile(ueLogPath, { encoding: 'utf-8' });
      // 大檔只取尾端,避免灌爆 renderer
      return content.length > TAIL_LIMIT ? content.slice(-TAIL_LIMIT) : content;
    }
    return '';
  } catch (e) {
    return '';
  }
});
