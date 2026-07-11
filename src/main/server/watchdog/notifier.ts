import { Notification } from 'electron';
import axios from 'axios';
import getServerInfoByServerId from '../../services/serverInstanceSettings/getServerInfoByServerId';
import getWorldSettingsByServerId from '../../services/worldSettings/getWorldSettingsByServerId';
import trimWorldSettingsString from '../../../utils/trimWorldSettingsString';

/**
 * watchdog 事件通知:桌面通知 + Discord Webhook。
 * 全部 fire-and-forget — 通知失敗絕不能影響重啟流程。
 */
export default async function notifyWatchdogEvent(
  serverId: string,
  message: string,
) {
  let serverInfo: any = {};
  let serverName = serverId;
  try {
    serverInfo = await getServerInfoByServerId(serverId);
    const worldSettings = await getWorldSettingsByServerId(serverId);
    serverName =
      trimWorldSettingsString(worldSettings.ServerName || '') || serverId;
  } catch (e) {
    //
  }

  const text = `[${serverName}] ${message}`;

  if (serverInfo.NotifyDesktopEnabled ?? true) {
    try {
      if (Notification.isSupported()) {
        new Notification({
          title: 'palserver-GUI Watchdog',
          body: text,
        }).show();
      }
    } catch (e) {
      //
    }
  }

  const webhook = String(serverInfo.NotifyDiscordWebhook || '').trim();
  if (webhook.startsWith('https://')) {
    axios
      .post(webhook, { content: text }, { timeout: 5000 })
      .catch(() => {});
  }
}
