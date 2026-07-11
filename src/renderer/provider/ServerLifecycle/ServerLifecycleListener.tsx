import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import Channels from '../../../main/ipcs/channels';
import useIsRunningServers from '../../redux/isRunningServers/useIsRunningServers';
import { isRunningServersAction } from '../../redux/isRunningServers/isRunningServers.action';

/**
 * 常駐的伺服器生命週期監聽器。
 * 原本 DONE/EXIT 監聽器放在 BootServerButton 裡,只有選中伺服器時才掛載;
 * watchdog 在背景自動重啟時 (新的 processId) 若沒人監聽,
 * redux 裡就會留著過期 PID,停止鈕會殺錯程序。
 */
export default function ServerLifecycleListener() {
  const dispatch = useDispatch();
  const { addIsRunningServers, removeIsRunningServers } = useIsRunningServers();

  // 掛載時向 main 重建執行中清單 —
  // 涵蓋視窗重新整理、以及自動開服發生在視窗載入之前的情境
  useEffect(() => {
    let cancelled = false;
    window.electron.ipcRenderer
      .invoke(Channels.getRunningServers)
      .then(
        (
          running: { serverId: string; processId: number; queryPort: number }[],
        ) => {
          if (!cancelled && Array.isArray(running) && running.length) {
            dispatch(isRunningServersAction(running));
          }
          return running;
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

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
