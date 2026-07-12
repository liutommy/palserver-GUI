import { Badge } from '@radix-ui/themes';
import { useEffect, useState } from 'react';
import Channels from '../../../../main/ipcs/channels';
import { WatchdogStatus } from '../../../../types/Watchdog.types';
import useSelectedServerInstance from '../../../redux/selectedServerInstance/useSelectedServerInstance';
import useTranslation from '../../../hooks/translation/useTranslation';

export default function WatchdogBadge() {
  const { t } = useTranslation();
  const { selectedServerInstance } = useSelectedServerInstance();
  const [status, setStatus] = useState<WatchdogStatus | null>(null);

  useEffect(() => {
    let cancelled = false;

    // 掛載 / 切換伺服器時先主動同步一次
    window.electron.ipcRenderer
      .invoke(Channels.getWatchdogStatus, selectedServerInstance)
      .then((s: WatchdogStatus) => {
        if (!cancelled) setStatus(s);
        return s;
      })
      .catch(() => {});

    // 之後靠 main 推播更新
    const off = window.electron.ipcRenderer.on(
      Channels.watchdogStatusReply.DATA,
      (s: WatchdogStatus) => {
        if (s.serverId === selectedServerInstance) setStatus(s);
      },
    );

    return () => {
      cancelled = true;
      off();
    };
  }, [selectedServerInstance]);

  if (!status) return null;

  let badge: {
    color: 'grass' | 'amber' | 'red' | 'gray' | 'orange';
    label: string;
  };
  switch (status.state) {
    case 'external':
      badge = { color: 'orange', label: t('WatchdogStatusExternal') };
      break;
    case 'protected':
      badge = { color: 'grass', label: t('WatchdogStatusProtected') };
      break;
    case 'restarting':
      badge = {
        color: 'amber',
        label: `${t('WatchdogStatusRestarting')} (${status.restartCount}/${
          status.maxRestarts
        })`,
      };
      break;
    case 'gave-up':
      badge = { color: 'red', label: t('WatchdogStatusGaveUp') };
      break;
    case 'unmonitored':
      badge = { color: 'gray', label: t('WatchdogStatusUnmonitored') };
      break;
    default:
      // stopped:不顯示,和 ServerRunningBadge 的 Offline 重複
      return null;
  }

  return (
    <Badge color={badge.color} size="3" variant="soft">
      {badge.label}
    </Badge>
  );
}
