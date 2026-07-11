import { ipcMain } from 'electron';
import Channels from '../../channels';
import path from 'path';
import readWorldOptionsini from '../../../services/worldSettings/readWorldSettingsini';
import fsc from 'fs';
import getWorldSettingsByServerId from '../../../services/worldSettings/getWorldSettingsByServerId';
import resolveServerPath from '../../../services/serverInstanceSettings/resolveServerPath';

ipcMain.handle(Channels.getServerBanList, async (event, serverId: string) => {
  const banListPath = path.join(
    resolveServerPath(serverId),
    'Pal/Saved/SaveGames/banlist.txt',
  );

  const banListTxt = fsc.readFileSync(banListPath, { encoding: 'utf-8' });
  const banList = banListTxt.split('\n').slice(0, -1);

  return banList;
});
