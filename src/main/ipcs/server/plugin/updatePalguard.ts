import { ipcMain } from 'electron';
import Channels from '../../channels';
import path from 'path';
import loadPalguardTemplate from '../../../services/templates/loadPalguardTemplate';
import resolveServerPath from '../../../services/serverInstanceSettings/resolveServerPath';

ipcMain.on(Channels.updatePalguard, async (event, serverId: string) => {
  loadPalguardTemplate(
    path.join(resolveServerPath(serverId), 'Pal/Binaries/Win64'),
  );
});
