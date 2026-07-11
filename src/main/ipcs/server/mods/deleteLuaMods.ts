import { ipcMain } from 'electron';
import Channels from '../../channels';
import fsc from 'fs';
import path from 'path';
import { ServerInstanceSetting } from '../../../../types/ServerInstanceSetting.types';
import isJsonString from '../../../../utils/isJsonString';
import resolveServerPath from '../../../services/serverInstanceSettings/resolveServerPath';

ipcMain.handle(
  Channels.deleteLuaMods,
  async (event, serverId: string, modName: string) => {
    const luaModPath = path.join(
      resolveServerPath(serverId),
      'Pal/Binaries/Win64/Mods',
      modName,
    );

    if (fsc.existsSync(luaModPath)) {
      fsc.rmSync(luaModPath, { recursive: true, force: true });
    }
  },
);
