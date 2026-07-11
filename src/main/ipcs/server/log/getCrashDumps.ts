import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import fsc from 'fs';
import Channels from '../../channels';
import resolveServerPath from '../../../services/serverInstanceSettings/resolveServerPath';

export type CrashDumpList = {
  crashesPath: string;
  dumps: { name: string; mtimeMs: number }[];
};

// 列出 UE 崩潰紀錄 (Pal/Saved/Crashes),最新在前
ipcMain.handle(
  Channels.getCrashDumps,
  async (event, serverId: string): Promise<CrashDumpList> => {
    const crashesPath = path.join(
      resolveServerPath(serverId),
      'Pal/Saved/Crashes',
    );
    if (!fsc.existsSync(crashesPath)) {
      return { crashesPath, dumps: [] };
    }
    try {
      const names = await fs.readdir(crashesPath);
      const dumps = await Promise.all(
        names.map(async (name) => {
          const stat = await fs.stat(path.join(crashesPath, name));
          return { name, mtimeMs: stat.mtimeMs };
        }),
      );
      dumps.sort((a, b) => b.mtimeMs - a.mtimeMs);
      return { crashesPath, dumps };
    } catch (e) {
      return { crashesPath, dumps: [] };
    }
  },
);
