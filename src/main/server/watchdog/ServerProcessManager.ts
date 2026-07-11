/* eslint-disable no-await-in-loop */
import { BrowserWindow } from 'electron';
import { ChildProcess, spawn } from 'child_process';
import path from 'path';
import fsc from 'fs';
import os from 'os';
import Channels from '../../ipcs/channels';
import { USER_SERVER_INSTANCES_PATH } from '../../constant';
import getServerInfoByServerId from '../../services/serverInstanceSettings/getServerInfoByServerId';
import getWorldSettingsByServerId from '../../services/worldSettings/getWorldSettingsByServerId';
import resolveServerPath from '../../services/serverInstanceSettings/resolveServerPath';
import trimWorldSettingsString from '../../../utils/trimWorldSettingsString';
import sendCommand from '../../utils/rcon/sendCommand';
import sleep from '../../../utils/sleep';
import {
  WatchdogEvent,
  WatchdogStatus,
  WatchdogUIState,
} from '../../../types/Watchdog.types';
import {
  findProcessesUnderPath,
  getWorkingSetSize,
  killTree,
  resolveShippingPid,
  sweepServerProcesses,
} from './processUtils';
import restRequest from './restClient';

const PROBE_INTERVAL_MS = 30 * 1000;
const PROBE_TIMEOUT_MS = 5 * 1000;
const PROBE_FAIL_LIMIT = 3;
const RESTART_WINDOW_MS = 10 * 60 * 1000;
const RESTART_BACKOFFS_MS = [5 * 1000, 15 * 1000, 60 * 1000];
const RAM_LIMIT_PERCENT = 90;
const RAM_BREACH_LIMIT = 3;
const SHIPPING_RESOLVE_DELAY_MS = 15 * 1000;
const GRACEFUL_EXIT_WAIT_MS = 90 * 1000;

type WatchdogConfig = {
  enabled: boolean;
  hangProbe: boolean;
  maxRestarts: number;
  graceSec: number;
  skipIfPlayersOnline: boolean;
  autoRestartHours: number;
  overRamRestart: boolean;
};

type ManagedServer = {
  serverId: string;
  /** 每次 start() 遞增 — 舊生命週期的延遲回呼 (close 事件、逾時補刀) 不得影響新一代 */
  generation: number;
  child: ChildProcess | null;
  launcherPid: number | null;
  shippingPid: number | null;
  serverPath: string;
  queryPort: number;
  state: 'starting' | 'running' | 'restarting' | 'stopping' | 'stopped';
  userStop: boolean;
  terminatedHandled: boolean;
  gracefulRestart: boolean;
  restartTimestamps: number[];
  consecutiveCrashes: number;
  restartCount: number;
  probeTimer: NodeJS.Timeout | null;
  probeBusy: boolean;
  probeFailStreak: number;
  probeReady: boolean;
  ramBreachStreak: number;
  scheduleTimers: NodeJS.Timeout[];
  shippingResolveTimer: NodeJS.Timeout | null;
  logStream: fsc.WriteStream | null;
  startedAt: number;
  lastEvent: WatchdogEvent | null;
  lastEventAt: number | null;
};

/**
 * 主程序唯一的伺服器程序登記表 + watchdog。
 *
 * 舊實作把 ChildProcess 關在 startServer 閉包裡,主程序沒有任何
 * 執行中伺服器的真相來源;RCON 輪詢式的 crashRestart 又沒有單一
 * 執行保護,會無限重複開服 (upstream issue #39)。這裡改為:
 * - 以 child process 的 exit 事件為主要崩潰訊號 (不依賴 RCON/REST)
 * - 重啟前先掃除同路徑殘留程序,保證單一實例
 * - 崩潰迴圈保護 (視窗期內最多 N 次) + 退避
 * - 手動停止會標記 userStop,不會被 watchdog 重新拉起
 */
class ServerProcessManager {
  private servers = new Map<string, ManagedServer>();

  private createEntry(serverId: string): ManagedServer {
    return {
      serverId,
      generation: 0,
      child: null,
      launcherPid: null,
      shippingPid: null,
      serverPath: '',
      queryPort: 27015,
      state: 'stopped',
      userStop: false,
      terminatedHandled: true,
      gracefulRestart: false,
      restartTimestamps: [],
      consecutiveCrashes: 0,
      restartCount: 0,
      probeTimer: null,
      probeBusy: false,
      probeFailStreak: 0,
      probeReady: false,
      ramBreachStreak: 0,
      scheduleTimers: [],
      shippingResolveTimer: null,
      logStream: null,
      startedAt: 0,
      lastEvent: null,
      lastEventAt: null,
    };
  }

  private async getConfig(serverId: string): Promise<WatchdogConfig> {
    const serverInfo = await getServerInfoByServerId(serverId);
    return {
      enabled: serverInfo.WatchdogEnabled ?? true,
      hangProbe: serverInfo.WatchdogHangProbe ?? true,
      maxRestarts: serverInfo.WatchdogMaxRestarts ?? 3,
      graceSec: serverInfo.WatchdogStartupGraceSec ?? 180,
      skipIfPlayersOnline: serverInfo.RestartSkipIfPlayersOnline ?? true,
      autoRestartHours: serverInfo.AutoRestart ?? 0,
      overRamRestart: serverInfo.OverRamRestart ?? false,
    };
  }

  /**
   * 廣播給所有視窗。舊實作用 event.reply 綁定開服當下的 webContents,
   * 視窗重載後 watchdog 的重啟通知會消失,停止鈕就會殺到過期 PID。
   */
  // eslint-disable-next-line class-methods-use-this
  private broadcast(channel: string, ...args: any[]) {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, ...args);
      }
    });
  }

  private emitStatus(entry: ManagedServer) {
    this.getStatus(entry.serverId)
      .then((status) => this.broadcast(Channels.watchdogStatusReply.DATA, status))
      .catch(() => {});
  }

  async getStatus(serverId: string): Promise<WatchdogStatus> {
    const config = await this.getConfig(serverId);
    const entry = this.servers.get(serverId);
    const running = Boolean(
      entry && (entry.state === 'starting' || entry.state === 'running'),
    );

    let state: WatchdogUIState = 'stopped';
    if (entry?.state === 'restarting') {
      state = 'restarting';
    } else if (entry?.lastEvent === 'gave-up' && entry.state === 'stopped') {
      state = 'gave-up';
    } else if (running) {
      state = config.enabled ? 'protected' : 'unmonitored';
    }

    return {
      serverId,
      state,
      running,
      restartCount: entry?.restartCount ?? 0,
      maxRestarts: config.maxRestarts,
      lastEvent: entry?.lastEvent ?? null,
      lastEventAt: entry?.lastEventAt ?? null,
      hangProbeReady: entry?.probeReady ?? false,
    };
  }

  async start(
    serverId: string,
    queryPort = 27015,
    intent: 'user' | 'watchdog' = 'user',
  ): Promise<number | null> {
    let entry = this.servers.get(serverId);

    if (entry && intent === 'user') {
      if (entry.state === 'starting' || entry.state === 'running') {
        // 已在執行:重新廣播 DONE 讓 UI 同步,不重複開服
        this.broadcast(
          Channels.execStartServerReply.DONE,
          serverId,
          entry.launcherPid,
          entry.queryPort,
        );
        return entry.launcherPid;
      }
      if (entry.state === 'restarting' || entry.state === 'stopping') {
        return null;
      }
      // 使用者重新開服:重置崩潰統計
      entry.restartTimestamps = [];
      entry.consecutiveCrashes = 0;
      entry.restartCount = 0;
      entry.lastEvent = null;
      entry.lastEventAt = null;
    }

    if (!entry) {
      entry = this.createEntry(serverId);
      this.servers.set(serverId, entry);
    }

    entry.generation += 1;
    entry.queryPort = queryPort;
    entry.serverPath = resolveServerPath(serverId);
    entry.userStop = false;
    entry.terminatedHandled = false;
    entry.gracefulRestart = false;
    entry.probeFailStreak = 0;
    entry.probeReady = false;
    entry.probeBusy = false;
    entry.ramBreachStreak = 0;
    entry.state = 'starting';
    entry.startedAt = Date.now();

    // 開服前掃除同路徑的殘留程序,保證單一實例
    try {
      await sweepServerProcesses(entry.serverPath);
    } catch (e) {
      //
    }

    try {
      await this.launch(entry);
    } catch (e) {
      // .pal / ini 損毀等例外:不讓 state 卡在 starting;
      // 若 spawn 之後才拋錯,把已啟動的 child 收掉避免孤兒
      if (entry.child?.pid) {
        await killTree(entry.child.pid);
      }
      entry.child = null;
      entry.state = 'stopped';
      entry.terminatedHandled = true;
      this.emitStatus(entry);
      return null;
    }
    return entry.launcherPid;
  }

  private async launch(entry: ManagedServer) {
    const { serverId } = entry;
    const serverInfo = await getServerInfoByServerId(serverId);
    const worldSettings = await getWorldSettingsByServerId(serverId);
    const useIndependentProcess = serverInfo.UseIndependentProcess ?? true;

    const palserver = path.join(
      entry.serverPath,
      useIndependentProcess
        ? 'PalServer.exe'
        : 'Pal/Binaries/Win64/PalServer-Win64-Shipping.exe',
    );

    const args = [
      `-RCONPort=${worldSettings.RCONPort}`,
      `-port=${worldSettings.PublicPort}`,
      `-publicport=${worldSettings.PublicPort}`,
      `-publicip=${worldSettings.PublicIP}`,
      `-QueryPort=${entry.queryPort}`,
      serverInfo.openToCommunity ? '-publiclobby' : '',
      serverInfo.performanceOptimizationEnabled ? '-useperfthreads' : '',
      serverInfo.performanceOptimizationEnabled ? '-NoAsyncLoadingThread' : '',
      serverInfo.performanceOptimizationEnabled ? '-UseMultithreadForDS' : '',
    ].filter(Boolean);

    // 伺服器輸出導入實體資料夾下的 log 檔;
    // 舊實作 stdio 預設 pipe 又從不讀取,緩衝區塞滿會卡住子程序
    const logDir = path.join(USER_SERVER_INSTANCES_PATH, serverId, 'logs');
    try {
      fsc.mkdirSync(logDir, { recursive: true });
      entry.logStream = fsc.createWriteStream(
        path.join(logDir, 'palserver-latest.log'),
        { flags: 'w' },
      );
    } catch (e) {
      entry.logStream = null;
    }

    const child = spawn(palserver, args, {
      cwd: entry.serverPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    entry.child = child;
    entry.launcherPid = child.pid ?? null;
    entry.shippingPid = null;

    child.stdout?.on('data', (chunk) => {
      entry.logStream?.write(chunk);
      this.broadcast(
        Channels.execStartServerReply.DATA,
        serverId,
        chunk.toString(),
      );
    });
    child.stderr?.on('data', (chunk) => {
      entry.logStream?.write(chunk);
    });

    child.on('spawn', () => {
      entry.state = 'running';
      this.broadcast(
        Channels.execStartServerReply.DONE,
        serverId,
        entry.launcherPid,
        entry.queryPort,
      );
      this.emitStatus(entry);
    });

    // exit / close / error 可能重複觸發,handleTermination 內部去重;
    // 重啟後舊 child 延遲觸發的 close/error 不得影響新一代的生命週期
    const generationAtLaunch = entry.generation;
    const onDead = () => {
      if (entry.generation !== generationAtLaunch) return;
      this.handleTermination(entry);
    };
    child.on('exit', onDead);
    child.on('close', onDead);
    child.on('error', onDead);

    if (useIndependentProcess) {
      // PalServer.exe 只是啟動器,真正伺服器是 Shipping 子程序
      entry.shippingResolveTimer = setTimeout(async () => {
        entry.shippingPid = await resolveShippingPid(
          entry.launcherPid,
          entry.serverPath,
        );
      }, SHIPPING_RESOLVE_DELAY_MS);
    } else {
      entry.shippingPid = entry.launcherPid;
    }

    this.startProbeLoop(entry);

    const config = await this.getConfig(serverId);
    if (config.autoRestartHours > 0) {
      this.armScheduledRestart(entry, config.autoRestartHours);
    }
  }

  private handleTermination(entry: ManagedServer) {
    if (entry.terminatedHandled) return;
    entry.terminatedHandled = true;

    this.clearProbeTimer(entry);
    this.clearScheduleTimers(entry);
    if (entry.shippingResolveTimer) {
      clearTimeout(entry.shippingResolveTimer);
      entry.shippingResolveTimer = null;
    }
    entry.logStream?.end();
    entry.logStream = null;
    entry.child = null;

    this.broadcast(
      Channels.execStartServerReply.EXIT,
      entry.serverId,
      entry.launcherPid,
    );

    (async () => {
      if (entry.userStop || entry.state === 'stopping') {
        entry.state = 'stopped';
        this.emitStatus(entry);
        return;
      }

      if (entry.gracefulRestart) {
        // 計畫性重啟 (排程 / 記憶體超標):不列入崩潰計數
        entry.state = 'restarting';
        entry.restartCount += 1;
        this.emitStatus(entry);
        await sleep(5000);
        if (entry.userStop) return;
        try {
          await sweepServerProcesses(entry.serverPath);
        } catch (e) {
          //
        }
        await this.start(entry.serverId, entry.queryPort, 'watchdog');
        return;
      }

      const config = await this.getConfig(entry.serverId);
      if (!config.enabled) {
        entry.state = 'stopped';
        this.emitStatus(entry);
        return;
      }

      await this.handleCrash(entry, config);
    })().catch(() => {
      // .pal 損毀等例外:不讓 state 卡在 running/restarting
      entry.state = 'stopped';
      this.emitStatus(entry);
    });
  }

  private async handleCrash(entry: ManagedServer, config: WatchdogConfig) {
    const now = Date.now();
    if (entry.lastEvent !== 'hang') {
      entry.lastEvent = 'crash';
    }
    entry.lastEventAt = now;

    // 穩定運行超過視窗期後才掛掉的,當作新事件重算退避
    entry.consecutiveCrashes =
      now - entry.startedAt > RESTART_WINDOW_MS
        ? 1
        : entry.consecutiveCrashes + 1;

    entry.restartTimestamps = entry.restartTimestamps.filter(
      (t) => now - t < RESTART_WINDOW_MS,
    );
    if (entry.restartTimestamps.length >= config.maxRestarts) {
      // 崩潰迴圈保護:視窗期內重啟次數已達上限,放棄
      entry.state = 'stopped';
      entry.lastEvent = 'gave-up';
      this.emitStatus(entry);
      return;
    }
    entry.restartTimestamps.push(now);
    entry.restartCount += 1;
    entry.state = 'restarting';
    this.emitStatus(entry);

    const backoff =
      RESTART_BACKOFFS_MS[
        Math.min(entry.consecutiveCrashes - 1, RESTART_BACKOFFS_MS.length - 1)
      ];
    await sleep(backoff);
    if (entry.userStop) return;
    // 退避期間使用者已手動重新開服 → 不再重複啟動
    if (entry.state === 'starting' || entry.state === 'running') return;

    try {
      await sweepServerProcesses(entry.serverPath);
    } catch (e) {
      //
    }
    await this.start(entry.serverId, entry.queryPort, 'watchdog');
  }

  private startProbeLoop(entry: ManagedServer) {
    this.clearProbeTimer(entry);
    entry.probeTimer = setInterval(() => {
      if (entry.probeBusy) return;
      entry.probeBusy = true;
      this.probeTick(entry)
        .catch(() => {})
        .finally(() => {
          entry.probeBusy = false;
        });
    }, PROBE_INTERVAL_MS);
  }

  private async probeTick(entry: ManagedServer) {
    if (entry.state !== 'running' || entry.terminatedHandled) return;
    const config = await this.getConfig(entry.serverId);
    if (!config.enabled) return;
    if (Date.now() - entry.startedAt < config.graceSec * 1000) return;

    // --- 記憶體上限檢查 (OverRamRestart) ---
    if (config.overRamRestart) {
      try {
        const pid = entry.shippingPid ?? entry.launcherPid;
        const workingSet = pid ? await getWorkingSetSize(pid) : null;
        if (workingSet !== null) {
          const percent = (workingSet / os.totalmem()) * 100;
          if (percent > RAM_LIMIT_PERCENT) {
            entry.ramBreachStreak += 1;
            // 連續超標才動作,避免瞬間尖峰誤判
            if (entry.ramBreachStreak >= RAM_BREACH_LIMIT) {
              entry.ramBreachStreak = 0;
              await this.gracefulRestartServer(entry, 'ram');
              return;
            }
          } else {
            entry.ramBreachStreak = 0;
          }
        }
      } catch (e) {
        //
      }
    }

    // --- REST 存活探測 (掛起偵測) ---
    if (!config.hangProbe) return;
    const worldSettings = await getWorldSettingsByServerId(entry.serverId);
    if (worldSettings.RESTAPIEnabled !== true) return;

    try {
      await restRequest(entry.serverId, '/metrics', {
        timeoutMs: PROBE_TIMEOUT_MS,
      });
      entry.probeReady = true;
      entry.probeFailStreak = 0;
    } catch (e) {
      // 開機後首次成功前不計失敗 — 大型存檔載入可能超過寬限期
      if (!entry.probeReady) return;
      entry.probeFailStreak += 1;
      if (entry.probeFailStreak >= PROBE_FAIL_LIMIT) {
        // 程序活著但 REST 連續無回應 → 判定掛起,強制終止後由 exit 流程重啟
        const generationAtHang = entry.generation;
        entry.lastEvent = 'hang';
        entry.lastEventAt = Date.now();
        entry.probeFailStreak = 0;
        if (entry.launcherPid) {
          await killTree(entry.launcherPid);
        }
        // killTree 之後 exit 流程可能已開始重啟 — 不可清掃到新一代
        if (entry.generation !== generationAtHang) return;
        try {
          await sweepServerProcesses(entry.serverPath);
        } catch (err) {
          //
        }
      }
    }
  }

  private armScheduledRestart(entry: ManagedServer, hours: number) {
    this.clearScheduleTimers(entry);
    const intervalMs = hours * 60 * 60 * 1000;
    const warn5 = Math.max(intervalMs - 5 * 60 * 1000, 0);
    const warn1 = Math.max(intervalMs - 60 * 1000, 0);

    entry.scheduleTimers.push(
      setTimeout(() => {
        this.announce(entry.serverId, 'Server will restart in 5 minutes.');
      }, warn5),
    );
    entry.scheduleTimers.push(
      setTimeout(() => {
        this.announce(entry.serverId, 'Server will restart in 1 minute.');
      }, warn1),
    );
    entry.scheduleTimers.push(
      setTimeout(async () => {
        if (entry.state !== 'running') return;
        const config = await this.getConfig(entry.serverId);
        if (config.skipIfPlayersOnline) {
          const count = await this.getPlayerCount(entry.serverId);
          if (count !== null && count > 0) {
            // 還有玩家在線 → 順延一個完整週期
            this.announce(
              entry.serverId,
              'Scheduled restart postponed: players online.',
            );
            this.armScheduledRestart(entry, hours);
            return;
          }
        }
        await this.gracefulRestartServer(entry, 'scheduled');
      }, intervalMs),
    );
  }

  /**
   * 計畫性重啟:公告 → 存檔 → 優雅關機,exit 流程接手重新啟動。
   */
  private async gracefulRestartServer(
    entry: ManagedServer,
    reason: 'scheduled' | 'ram',
  ) {
    if (entry.state !== 'running') return;
    entry.gracefulRestart = true;
    entry.lastEvent = reason;
    entry.lastEventAt = Date.now();
    this.emitStatus(entry);

    const generationAtShutdown = entry.generation;
    const pidAtShutdown = entry.launcherPid;

    const delivered = await this.gracefulShutdown(
      entry.serverId,
      30,
      'Server is restarting...',
    );
    if (!delivered) {
      // 關機指令送不出去 (REST/RCON 都不可用) → 直接強制終止
      if (pidAtShutdown) await killTree(pidAtShutdown);
      return;
    }
    await sleep(GRACEFUL_EXIT_WAIT_MS);
    // 補刀只針對發出關機指令當下的那一代與那個 PID —
    // 正常情況下伺服器早已退出並重啟完成,絕不可誤殺新實例
    if (
      entry.generation === generationAtShutdown &&
      !entry.terminatedHandled &&
      entry.launcherPid !== null &&
      entry.launcherPid === pidAtShutdown
    ) {
      await killTree(entry.launcherPid);
    }
  }

  /**
   * 嘗試優雅關機:REST 優先 (官方已棄用 RCON),RCON 為後備。
   * 回傳是否成功送出關機指令。
   */
  private async gracefulShutdown(
    serverId: string,
    waittimeSec: number,
    message: string,
  ): Promise<boolean> {
    let worldSettings: any;
    try {
      worldSettings = await getWorldSettingsByServerId(serverId);
    } catch (e) {
      // ini 損毀時退化為強制終止路徑,不讓呼叫端 (stop/重啟) 卡死
      return false;
    }

    if (worldSettings.RESTAPIEnabled === true) {
      try {
        // 大型世界存檔可能耗時,timeout 放寬
        await restRequest(serverId, '/save', {
          method: 'post',
          timeoutMs: 60000,
        });
        await restRequest(serverId, '/shutdown', {
          method: 'post',
          body: { waittime: waittimeSec, message },
          timeoutMs: 10000,
        });
        return true;
      } catch (e) {
        //
      }
    }

    if (worldSettings.RCONEnabled === true) {
      const serverOptions = {
        ipAddress: '127.0.0.1',
        port: worldSettings.RCONPort,
        password: trimWorldSettingsString(worldSettings.AdminPassword),
      };
      try {
        // RCON client 沒有逾時機制,掛住的伺服器會讓 promise 永遠 pending
        await this.withTimeout(sendCommand(serverOptions, 'save'), 10000);
        await this.withTimeout(
          sendCommand(serverOptions, `shutdown ${waittimeSec}`),
          10000,
        );
        return true;
      } catch (e) {
        //
      }
    }

    return false;
  }

  // eslint-disable-next-line class-methods-use-this
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
  }

  private announce(serverId: string, message: string) {
    restRequest(serverId, '/announce', {
      method: 'post',
      body: { message },
      timeoutMs: 5000,
    }).catch(() => {});
  }

  // eslint-disable-next-line class-methods-use-this
  private async getPlayerCount(serverId: string): Promise<number | null> {
    try {
      const data = await restRequest(serverId, '/players', {
        timeoutMs: 5000,
      });
      return Array.isArray(data?.players) ? data.players.length : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 使用者主動停止。一定要先標記 userStop,
   * 否則 exit 事件會被 watchdog 當成崩潰再拉起來。
   */
  async stop(serverId: string, fallbackPid?: number) {
    const entry = this.servers.get(serverId);
    const serverPath = entry?.serverPath || resolveServerPath(serverId);

    if (entry) {
      entry.userStop = true;
      entry.state = 'stopping';
      this.clearScheduleTimers(entry);
      this.clearProbeTimer(entry);
      this.emitStatus(entry);
    }

    const pid = entry?.launcherPid ?? fallbackPid ?? null;
    const generationAtStop = entry?.generation ?? -1;
    const delivered = await this.gracefulShutdown(
      serverId,
      1,
      'Server is shutting down.',
    );

    if (delivered) {
      // 等待伺服器自行退出 (含存檔時間),最多 30 秒
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        if (entry && entry.generation !== generationAtStop) return;
        if (entry?.terminatedHandled) break;
        if (!entry) {
          // GUI 重啟後的孤兒:收不到 exit 事件,改輪詢程序是否還在
          const remaining = await findProcessesUnderPath(serverPath);
          if (remaining.length === 0) break;
        }
        await sleep(2000);
      }
    }

    // 舊實例退出後使用者可能立刻又按了啟動 —
    // 此時絕不可執行後面的強殺/清掃,否則會殺掉剛啟動的新實例
    if (entry && entry.generation !== generationAtStop) return;

    if ((!entry || !entry.terminatedHandled) && pid) {
      await killTree(pid);
    }
    try {
      await sweepServerProcesses(serverPath);
    } catch (e) {
      //
    }

    if (entry) {
      if (entry.generation !== generationAtStop) return;
      // 若 exit 事件已在崩潰流程中處理過 (例如退避等待期間手動停止),
      // 不會再有事件把 state 收尾,這裡直接標記為 stopped
      entry.state = 'stopped';
      this.emitStatus(entry);
    } else {
      // 無登記表項目 (孤兒),手動廣播 EXIT 讓 UI 同步
      this.broadcast(Channels.execStartServerReply.EXIT, serverId, pid);
    }
  }

  private clearProbeTimer(entry: ManagedServer) {
    if (entry.probeTimer) {
      clearInterval(entry.probeTimer);
      entry.probeTimer = null;
    }
  }

  private clearScheduleTimers(entry: ManagedServer) {
    entry.scheduleTimers.forEach((t) => clearTimeout(t));
    entry.scheduleTimers = [];
  }

  /**
   * App 結束前呼叫:停掉所有計時器,避免退出過程中又觸發重啟。
   * 伺服器程序本身刻意不殺 — 關閉 GUI 不代表要關伺服器。
   */
  dispose() {
    this.servers.forEach((entry) => {
      entry.userStop = true;
      this.clearProbeTimer(entry);
      this.clearScheduleTimers(entry);
      if (entry.shippingResolveTimer) {
        clearTimeout(entry.shippingResolveTimer);
        entry.shippingResolveTimer = null;
      }
      entry.logStream?.end();
      entry.logStream = null;
    });
  }
}

const serverProcessManager = new ServerProcessManager();
export default serverProcessManager;
