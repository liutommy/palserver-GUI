export type WatchdogEvent = 'crash' | 'hang' | 'ram' | 'scheduled' | 'gave-up';

export type WatchdogUIState =
  | 'protected'
  | 'unmonitored'
  | 'restarting'
  | 'gave-up'
  | 'stopped';

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
