import path from 'path';
import fsc from 'fs';
import readWorldSettingsini from './readWorldSettingsini';
import resolveServerPath from '../serverInstanceSettings/resolveServerPath';

export default async (serverId: string) => {
  const worldSettingsPath = path.join(
    resolveServerPath(serverId),
    'Pal/Saved/Config/WindowsServer/PalWorldSettings.ini',
  );

  if (fsc.existsSync(worldSettingsPath)) {
    const worldSetting = await readWorldSettingsini(worldSettingsPath);
    return worldSetting;
  }
  return {};
};
