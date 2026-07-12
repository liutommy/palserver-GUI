import React from 'react';
import useTranslation from '../../../hooks/translation/useTranslation';
import Channels from '../../../../main/ipcs/channels';
import useSelectedServerInstance from '../../../redux/selectedServerInstance/useSelectedServerInstance';
import useIsRunningServers from '../../../redux/isRunningServers/useIsRunningServers';
import { AlertDialog } from '@radix-ui/themes';

export default function BootServerButton() {
  const { t } = useTranslation();

  const { selectedServerInstance } = useSelectedServerInstance();
  const { includeRunningServers, isRunningServers } = useIsRunningServers();
  const isServerRunning = includeRunningServers(selectedServerInstance);

  // 啟動伺服器
  const handleBootServer = async () => {
    // setting query port (thanks Pumpkin at Hydra Network <3)
    const queryPorts = isRunningServers.map((server) => server.queryPort);
    let queryPort = 27015;
    while (queryPorts.includes(queryPort)) {
      queryPort = Number(
        `270${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 10)}`,
      );
    }

    // start the server
    window.electron.ipcRenderer.sendMessage(
      Channels.execStartServer,
      selectedServerInstance,
      queryPort,
    );
  };

  // 關閉伺服器
  const handleShutDownServer = () => {
    const processId = isRunningServers.find(
      (server) => server.serverId === selectedServerInstance,
    )?.processId as number;

    // 確保伺服器已啟用 (否則無法執行 rcon 指令)
    window.electron.ipcRenderer.sendMessage(
      Channels.execShutdownServer,
      selectedServerInstance,
      processId,
    );
  };

  // DONE/EXIT 監聽已移至常駐的 ServerLifecycleListener,
  // watchdog 背景重啟時才不會遺失新 PID

  return (
    <div>
      <div
        onClick={isServerRunning ? handleShutDownServer : handleBootServer}
        className="w-full h-10 bg-gray-200 hover:bg-slate-50 text-bg1 rounded-lg flex items-center justify-center select-none cursor-pointer"
      >
        {isServerRunning ? t('CloseServer') : t('BootServer')}
      </div>
    </div>
  );
}
