import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import fsc from 'fs';
import uniqid from 'uniqid';
import Channels from '../../channels';
import { USER_SERVER_INSTANCES_PATH } from '../../../constant';
import { ServerInstanceSetting } from '../../../../types/ServerInstanceSetting.types';

export type ImportServerResult =
  | { serverId: string }
  | { error: 'INVALID_PATH' | 'ALREADY_IMPORTED'; serverId?: string };

/**
 * 匯入現有的 Palworld 專用伺服器 (例如 SteamLibrary 下的 PalServer)。
 * 只建立實體中繼資料 (.pal),不複製伺服器檔案;
 * 刪除實體時外部伺服器本體不受影響。
 */
ipcMain.handle(
  Channels.importServerInstance,
  async (
    event,
    externalServerPath: string,
    options?: { validateOnly?: boolean },
  ): Promise<ImportServerResult> => {
    const normalizedPath = path.resolve(externalServerPath);

    // 驗證是有效的伺服器資料夾
    if (!fsc.existsSync(path.join(normalizedPath, 'PalServer.exe'))) {
      return { error: 'INVALID_PATH' };
    }

    // 同一路徑不可重複匯入,否則兩個實體會搶同一個伺服器
    try {
      const instanceIds = await fs.readdir(USER_SERVER_INSTANCES_PATH);
      // eslint-disable-next-line no-restricted-syntax
      for (const instanceId of instanceIds) {
        const palPath = path.join(USER_SERVER_INSTANCES_PATH, instanceId, '.pal');
        if (fsc.existsSync(palPath)) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const pal = JSON.parse(
              await fs.readFile(palPath, { encoding: 'utf-8' }),
            );
            if (
              pal.ExternalServerPath &&
              path.resolve(pal.ExternalServerPath).toLowerCase() ===
                normalizedPath.toLowerCase()
            ) {
              return { error: 'ALREADY_IMPORTED', serverId: pal.serverId };
            }
          } catch (e) {
            // 壞損的 .pal 跳過
          }
        }
      }
    } catch (e) {
      // instances 目錄不存在時由 mkdir 建立
    }

    // 僅驗證 (匯入對話框選完資料夾時的預檢)
    if (options?.validateOnly) {
      return { serverId: '' };
    }

    const serverId = uniqid('sr-');
    const createdTime = Date.now();
    const instancePath = path.join(USER_SERVER_INSTANCES_PATH, serverId);

    await fs.mkdir(instancePath, { recursive: true });

    const serverInstanceSettingJson: ServerInstanceSetting = {
      serverId,
      instancePath,
      serverPath: normalizedPath,
      ExternalServerPath: normalizedPath,
      iconId: 'SheepBall',
      createdAt: createdTime,
      performanceOptimizationEnabled: false,
      performanceMonitorEnabled: false,
      performanceMonitorAnimationEnabled: true,
      // 外部伺服器預設不注入任何模組
      ue4ssEnabled: false,
      palguardEnabled: false,
      modManagementEnabled: false,
      AutoRestart: 0,
      CrashRestart: false,
      OverRamRestart: false,
      openToCommunity: false,
      OnlineMapEnabled: false,
      LogEnabled: true,
      UseIndependentProcess: true,
      WatchdogEnabled: true,
      WatchdogHangProbe: true,
      WatchdogMaxRestarts: 3,
      WatchdogStartupGraceSec: 180,
      RestartSkipIfPlayersOnline: true,
    };

    await fs.writeFile(
      path.join(instancePath, '.pal'),
      JSON.stringify(serverInstanceSettingJson, null, 4),
      { encoding: 'utf-8' },
    );

    return { serverId };
  },
);
