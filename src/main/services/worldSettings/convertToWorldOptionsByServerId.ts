import path from 'path';
import fsc from 'fs';
import getSortedFiles from '../../utils/getSortedFiles';
import convertToWorldOptionsSav from './convertToWorldOptionsSav';
import resolveServerPath from '../serverInstanceSettings/resolveServerPath';

export default async (serverId: string) => {
  const serverPath = resolveServerPath(serverId);

  const worldSettingsPath = path.join(
    serverPath,
    'Pal/Saved/Config/WindowsServer/PalWorldSettings.ini',
  );

  const saveGamesZeroPath = path.join(serverPath, 'Pal/Saved/SaveGames/0');

  if (fsc.existsSync(saveGamesZeroPath)) {
    const saveGamesZeroDir = await getSortedFiles(saveGamesZeroPath);

    if (saveGamesZeroDir.length) {
      const saveGamesPath = path.join(saveGamesZeroPath, saveGamesZeroDir[0]);
      convertToWorldOptionsSav(worldSettingsPath, saveGamesPath);
    }
  }
};
