import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import fsc from 'fs';
import Channels from '../../channels';
import { TEMPLATE_PATH } from '../../../constant';
import getServerInfoByServerId from '../../../services/serverInstanceSettings/getServerInfoByServerId';
import resolveServerPath from '../../../services/serverInstanceSettings/resolveServerPath';
import loadUE4SSTemplate from '../../../services/templates/loadUE4SSTemplate';
import ensureRestApiEnabled from '../../../services/worldSettings/ensureRestApiEnabled';
import serverProcessManager from '../../../server/watchdog/ServerProcessManager';

ipcMain.on(
  Channels.execStartServer,
  async (event, serverId, queryport = 27015) => {
    const serverInfo = await getServerInfoByServerId(serverId);
    const serverPath = resolveServerPath(serverId);
    const isExternal = Boolean(serverInfo.ExternalServerPath);
    const binariesWin64Path = path.join(serverPath, 'Pal/Binaries/Win64');

    // #region enable ue4ss

    const ue4ssEnabled = serverInfo.ue4ssEnabled;
    const ue4ssPath = path.join(binariesWin64Path, 'UE4SS.dll');
    const ue4ssDisabledPath = path.join(
      binariesWin64Path,
      'UE4SS.disabled.dll',
    );

    // 如果 ue4ss 先前被禁用
    if (fsc.existsSync(ue4ssDisabledPath)) {
      if (ue4ssEnabled) {
        // ue4ss 啟用
        fsc.renameSync(ue4ssDisabledPath, ue4ssPath);
      }
    }
    // 如果 ue4ss 先前被啟用
    else if (fsc.existsSync(ue4ssPath)) {
      if (!ue4ssEnabled) {
        // ue4ss 禁用
        fsc.renameSync(ue4ssPath, ue4ssDisabledPath);
      }
    }
    // 如果不存在 ue4ss
    else {
      // eslint-disable-next-line no-lonely-if
      if (ue4ssEnabled) {
        loadUE4SSTemplate(path.join(serverPath, 'Pal/Binaries/Win64'));
      }
    }

    // #endregion

    // #region enable palguard

    const palguardEnabled = serverInfo.palguardEnabled;
    const palguardPath = path.join(binariesWin64Path, 'PalDefender.dll');
    const palguardDisabledPath = path.join(
      binariesWin64Path,
      'PalDefender.disabled.dll',
    );

    // 如果 palguard 先前被禁用
    if (fsc.existsSync(palguardDisabledPath)) {
      if (palguardEnabled) {
        // ue4ss 啟用
        fsc.renameSync(palguardDisabledPath, palguardPath);
      }
    }
    // 如果 palguard 先前被啟用
    else if (fsc.existsSync(palguardPath)) {
      if (!palguardEnabled) {
        // ue4ss 禁用
        fsc.renameSync(palguardPath, palguardDisabledPath);
      }
    }
    // 如果不存在 palguard
    else {
      // eslint-disable-next-line no-lonely-if
      if (palguardEnabled) {
        loadUE4SSTemplate(path.join(serverPath, 'Pal/Binaries/Win64'));
      }
    }

    // #endregion

    // #region optimized

    const optEngineIni = path.join(
      TEMPLATE_PATH,
      'Config/Engine.ini/opt/Engine.ini',
    );
    const pureEngineIni = path.join(
      TEMPLATE_PATH,
      'Config/Engine.ini/pure/Engine.ini',
    );
    const destEngineIni = path.join(
      serverPath,
      'Pal/Saved/Config/WindowsServer/Engine.ini',
    );
    if (serverInfo.performanceOptimizationEnabled) {
      if (fsc.existsSync(optEngineIni)) {
        await fs.copyFile(optEngineIni, destEngineIni);
      }
    } else if (!isExternal) {
      // 外部匯入的伺服器不主動覆寫其原有 Engine.ini
      if (fsc.existsSync(pureEngineIni)) {
        await fs.copyFile(pureEngineIni, destEngineIni);
      }
    }
    // #endregion

    // #region watchdog 前置:確保 REST API 可用 (掛起偵測 / 優雅關機的前提)

    const watchdogEnabled = serverInfo.WatchdogEnabled ?? true;
    const hangProbe = serverInfo.WatchdogHangProbe ?? true;
    if (watchdogEnabled && hangProbe) {
      try {
        // 寫在 spawn 之前,伺服器這次開機就會讀到新設定
        await ensureRestApiEnabled(serverId);
      } catch (e) {
        // ini 異常時仍可退化為 exit 事件偵測
      }
    }

    // #endregion

    // start server (spawn、崩潰偵測、排程重啟都在 ServerProcessManager)

    await serverProcessManager.start(serverId, queryport, 'user');
  },
);
