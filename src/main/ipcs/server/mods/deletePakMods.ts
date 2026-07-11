import { ipcMain } from 'electron';
import Channels from '../../channels';
import fsc from 'fs';
import path from 'path';
import { ServerInstanceSetting } from '../../../../types/ServerInstanceSetting.types';
import isJsonString from '../../../../utils/isJsonString';
import resolveServerPath from '../../../services/serverInstanceSettings/resolveServerPath';

ipcMain.handle(
  Channels.deletePakMods,
  async (event, serverId: string, modName: string) => {
    const pakModsPath = path.join(
      resolveServerPath(serverId),
      'Pal/Content/Paks',
      modName,
    );

    if (fsc.existsSync(pakModsPath)) {
      fsc.rmSync(pakModsPath, { recursive: true, force: true });
    }
  },
);
