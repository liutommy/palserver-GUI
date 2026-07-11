import { ipcMain } from 'electron';
import Channels from '../../channels';
import path from 'path';
import fs from 'fs';
import getSortedFiles from '../../../utils/getSortedFiles';
import resolveServerPath from '../../../services/serverInstanceSettings/resolveServerPath';

// 每個 serverId 只保留一組監看 — 舊實作每次請求都疊加
// fs.watchFile/fs.watch 且從不清除,切換日誌來源會累積洩漏
const activeWatchers = new Map<
  string,
  { watchedFile: string | null; dirWatcher: fs.FSWatcher | null }
>();

function clearWatchers(serverId: string) {
  const prev = activeWatchers.get(serverId);
  if (!prev) return;
  if (prev.watchedFile) {
    try {
      fs.unwatchFile(prev.watchedFile);
    } catch (e) {
      //
    }
  }
  try {
    prev.dirWatcher?.close();
  } catch (e) {
    //
  }
  activeWatchers.delete(serverId);
}

ipcMain.on(Channels.getServerLog, async (event, serverId) => {
  const serverPath = resolveServerPath(serverId);
  const serverLogsPath = path.join(
    serverPath,
    'Pal/Binaries/Win64/PalDefender/logs',
  );

  clearWatchers(serverId);

  // 未安裝 PalDefender (例如外部匯入的伺服器) → 回覆空內容
  if (!fs.existsSync(serverLogsPath)) {
    event.reply(Channels.getServerLogReply.DATA, '');
    return;
  }

  const entry: { watchedFile: string | null; dirWatcher: fs.FSWatcher | null } =
    { watchedFile: null, dirWatcher: null };
  activeWatchers.set(serverId, entry);

  const readAndReply = (logFile: string) => {
    try {
      const log = fs.readFileSync(logFile, { encoding: 'utf-8' });
      event.reply(Channels.getServerLogReply.DATA, log);
    } catch (e) {
      event.reply(Channels.getServerLogReply.DATA, '');
    }
  };

  const watchFile = (logFile: string) => {
    if (entry.watchedFile) {
      try {
        fs.unwatchFile(entry.watchedFile);
      } catch (e) {
        //
      }
    }
    entry.watchedFile = logFile;
    fs.watchFile(logFile, () => {
      readAndReply(logFile);
    });
  };

  try {
    let serverLogsDir = await getSortedFiles(serverLogsPath);
    if (!serverLogsDir.length) {
      event.reply(Channels.getServerLogReply.DATA, '');
    } else {
      const serverLogFile = path.join(serverLogsPath, serverLogsDir[0]);
      readAndReply(serverLogFile);
      watchFile(serverLogFile);
    }

    entry.dirWatcher = fs.watch(serverLogsPath, async () => {
      try {
        serverLogsDir = await getSortedFiles(serverLogsPath);
        serverLogsDir = serverLogsDir.filter((l) =>
          /^\d{2}\.\d{2} \d{2}\.\d{2}\.\d{2}$/.test(l),
        ); // 更新過濾條件
        if (!serverLogsDir.length) return;

        // latest log file
        const latest = path.join(serverLogsPath, serverLogsDir[0]);
        readAndReply(latest);
        watchFile(latest);
      } catch (e) {
        //
      }
    });
  } catch (e) {
    event.reply(Channels.getServerLogReply.DATA, '');
  }
});
