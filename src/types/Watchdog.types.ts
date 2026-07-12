export type WatchdogEvent = 'crash' | 'hang' | 'ram' | 'scheduled' | 'gave-up';

export type WatchdogUIState =
  | 'protected'
  | 'unmonitored'
  | 'restarting'
  | 'gave-up'
  | 'stopped'
  /** 該路徑有非 GUI 啟動的伺服器在跑 — 未受監控,按啟動可優雅接管 */
  | 'external';

export type WatchdogStatus = {
  serverId: string;
  state: WatchdogUIState;
  running: boolean;
  restartCount: number;
  maxRestarts: number;
  lastEvent: WatchdogEvent | null;
  lastEventAt: number | null;
  hangProbeReady: boolean;
};
