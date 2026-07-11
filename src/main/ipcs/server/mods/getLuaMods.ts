import { ipcMain } from 'electron';
import Channels from '../../channels';
import fsc from 'fs';
import path from 'path';
import { ServerInstanceSetting } from '../../../../types/ServerInstanceSetting.types';
import isJsonString from '../../../../utils/isJsonString';
import resolveServerPath from '../../../services/serverInstanceSettings/resolveServerPath';

ipcMain.handle(Channels.getLuaMods, async (event, serverId: string) => {
  const luaModsPath = path.join(
    resolveServerPath(serverId),
    'Pal/Binaries/Win64/Mods',
  );

  if (fsc.existsSync(luaModsPath)) {
    //
    const luaModNames = fsc
      .readdirSync(luaModsPath)
      .filter((mod) => mod !== 'mods.txt' && mod !== 'mods.rename.json');

    return luaModNames.map((name) => ({
      name,
      isDirectory: fsc.statSync(path.join(luaModsPath, name)).isDirectory(),
    }));
  }

  return [];
});
