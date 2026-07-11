import path from 'path';
import fsc from 'fs';
import getSortedFiles from '../../utils/getSortedFiles';
import convertToWorldOptionsSav from './convertToWorldOptionsSav';
import writeWorldSettingsini from './writeWorldSettingsini';
import convertToWorldOptionsByServerId from './convertToWorldOptionsByServerId';
import resolveServerPath from '../serverInstanceSettings/resolveServerPath';

export default async (serverId: string, worldSettingsiniJson: any) => {
  const serverPath = resolveServerPath(serverId);

  const worldSettingsPath = path.join(
    serverPath,
    'Pal/Saved/Config/WindowsServer/PalWorldSettings.ini',
  );

  await writeWorldSettingsini(worldSettingsPath, worldSettingsiniJson);
  // 退役了
  // convertToWorldOptionsByServerId(serverId);
};
