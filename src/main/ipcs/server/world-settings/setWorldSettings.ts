import { ipcMain } from 'electron';
import Channels from '../../channels';
import setWorldSettingsiniByServerId from '../../../services/worldSettings/setWorldSettingsiniByServerId';

ipcMain.handle(
  Channels.setWorldSettings,
  async (event, serverId: string, newWorldSettings: any) => {
    setWorldSettingsiniByServerId(serverId, newWorldSettings);
  },
);
