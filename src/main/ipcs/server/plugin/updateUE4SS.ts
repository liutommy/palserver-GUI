import { ipcMain } from 'electron';
import Channels from '../../channels';
import path from 'path';
import loadUE4SSTemplate from '../../../services/templates/loadUE4SSTemplate';
import resolveServerPath from '../../../services/serverInstanceSettings/resolveServerPath';

ipcMain.on(Channels.updateUE4SS, async (event, serverId: string) => {
  loadUE4SSTemplate(
    path.join(resolveServerPath(serverId), 'Pal/Binaries/Win64'),
  );
});
