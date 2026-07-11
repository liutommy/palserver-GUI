import { ipcMain } from 'electron';
import Channels from '../../channels';
import fsc from 'fs';
import path from 'path';
import resolveServerPath from '../../../services/serverInstanceSettings/resolveServerPath';

ipcMain.handle(Channels.getPakLogicMods, async (event, serverId: string) => {
  const pakModsPath = path.join(
    resolveServerPath(serverId),
    'Pal/Content/Paks/LogicMods',
  );

  if (fsc.existsSync(pakModsPath)) {
    //
    const pakModsNames = fsc.readdirSync(pakModsPath);

    return pakModsNames.map((name) => ({
      name,
      isDirectory: fsc.statSync(path.join(pakModsPath, name)).isDirectory(),
    }));
  }

  return [];
});
