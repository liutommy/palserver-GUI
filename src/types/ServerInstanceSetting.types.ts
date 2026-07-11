export type ServerInstanceSetting = {
  readonly palworldVersion?: string;
  readonly serverId: string;
  readonly instancePath: string;
  readonly serverPath: string;
  readonly iconId: string;
  readonly createdAt: number /* Date.now() */;
  readonly editedAt?: number;
  readonly performanceOptimizationEnabled: boolean;
  readonly performanceMonitorEnabled: boolean;
  readonly performanceMonitorAnimationEnabled: boolean;
  readonly ue4ssEnabled: boolean;
  readonly palguardEnabled: boolean;
  readonly modManagementEnabled: boolean;
  readonly AutoRestart: number;
  readonly CrashRestart: boolean;
  readonly OverRamRestart: boolean;
  readonly openToCommunity: boolean;
  readonly OnlineMapEnabled: boolean;
  readonly LogEnabled: boolean;
  readonly UseIndependentProcess: boolean;
  /** 匯入的外部伺服器路徑;有值時取代 <instance>/server 佈局 */
  readonly ExternalServerPath?: string;
  /** watchdog 設定 — 舊實體的 .pal 沒有這些欄位,讀取時需給預設值 */
  readonly WatchdogEnabled?: boolean;
  readonly WatchdogHangProbe?: boolean;
  readonly WatchdogMaxRestarts?: number;
  readonly WatchdogStartupGraceSec?: number;
  readonly RestartSkipIfPlayersOnline?: boolean;
  /** watchdog 事件通知 */
  readonly NotifyDesktopEnabled?: boolean;
  readonly NotifyDiscordWebhook?: string;
  /** 自動重啟前備份 SaveGames */
  readonly BackupOnRestart?: boolean;
  /** GUI 啟動時自動開服 (搭配開機自啟達成無人值守) */
  readonly AutoStartOnLaunch?: boolean;
};
