import { ipcMain } from 'electron';
import Channels from '../../channels';
import prepareAndStartServer from '../../../server/prepareAndStartServer';

ipcMain.on(
  Channels.execStartServer,
  async (event, serverId, queryport = 27015) => {
    await prepareAndStartServer(serverId, queryport);
  },
);
