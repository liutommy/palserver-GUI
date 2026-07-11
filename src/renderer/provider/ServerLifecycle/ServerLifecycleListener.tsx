import { useEffect } from 'react';
import Channels from '../../../main/ipcs/channels';
import useIsRunningServers from '../../redux/isRunningServers/useIsRunningServers';

/**
 * 常駐的伺服器生命週期監聽器。
 * 原本 DONE/EXIT 監聽器放在 BootServerButton 裡,只有選中伺服器時才掛載;
 * watchdog 在背景自動重啟時 (新的 processId) 若沒人監聽,
 * redux 裡就會留著過期 PID,停止鈕會殺錯程序。
 */
export default function ServerLifecycleListener() {
  const { addIsRunningServers, removeIsRunningServers } = useIsRunningServers();

  useEffect(() => {
    const offDone = window.electron.ipcRenderer.on(
      Channels.execStartServerReply.DONE,
      (serverId, processId, queryPort) => {
        addIsRunningServers(serverId, processId, queryPort);
      },
    );
    const offExit = window.electron.ipcRenderer.on(
      Channels.execStartServerReply.EXIT,
      (serverId) => {
        removeIsRunningServers(serverId);
      },
    );

    return () => {
      offDone();
      offExit();
    };
  }, [addIsRunningServers, removeIsRunningServers]);

  return null;
}
