import { ipcMain } from 'electron';
import Channels from '../../channels';
import path from 'path';
import fs from 'fs/promises';
import fsc from 'fs';
import getSortedFiles from '../../../utils/getSortedFiles';
import resolveServerPath from '../../../services/serverInstanceSettings/resolveServerPath';

ipcMain.handle(Channels.getCorrectSaveGamesPath, async (event, serverId) => {
  const serverPath = resolveServerPath(serverId);
  const saveGamesZeroPath = path.join(serverPath, 'Pal/Saved/SaveGames/0');

  if (fsc.existsSync(saveGamesZeroPath)) {
    const saveGamesZeroDir = await getSortedFiles(saveGamesZeroPath);

    if (!saveGamesZeroDir.length) return '';

    const saveGamesPath = path.join(saveGamesZeroPath, saveGamesZeroDir[0]);
    return saveGamesPath;
  }
  return '';
});
