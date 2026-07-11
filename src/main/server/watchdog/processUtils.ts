import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export type PalProcess = {
  pid: number;
  ppid: number;
  exePath: string;
  name: string;
  workingSet: number;
};

const PAL_PROCESS_NAMES = [
  'PalServer.exe',
  'PalServer-Win64-Shipping.exe',
  'PalServer-Win64-Shipping-Cmd.exe',
];

/**
 * 查詢所有 Palworld 伺服器相關程序。
 * wmic 已從 Windows 11 24H2+ 移除,pidusage 也依賴 wmic,
 * 因此一律走 PowerShell CIM。
 */
export async function queryPalProcesses(): Promise<PalProcess[]> {
  const filter = PAL_PROCESS_NAMES.map((n) => `Name='${n}'`).join(' OR ');
  const script = `Get-CimInstance Win32_Process -Filter "${filter}" | Select-Object ProcessId,ParentProcessId,ExecutablePath,Name,WorkingSetSize | ConvertTo-Json -Compress`;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        script,
      ],
      { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 },
    );
    const text = stdout.trim();
    if (!text) return [];
    let parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) parsed = [parsed];
    return parsed
      .filter((p: any) => p && p.ProcessId)
      .map((p: any) => ({
        pid: p.ProcessId,
        ppid: p.ParentProcessId || 0,
        exePath: p.ExecutablePath || '',
        name: p.Name || '',
        workingSet: p.WorkingSetSize || 0,
      }));
  } catch (e) {
    return [];
  }
}

/**
 * 找出執行檔位於指定 server 資料夾底下的伺服器程序
 * (含 launcher 與 Shipping 子程序)。
 */
export async function findProcessesUnderPath(
  serverPath: string,
): Promise<PalProcess[]> {
  const prefix = `${path.resolve(serverPath).toLowerCase()}${path.sep}`;
  const all = await queryPalProcesses();
  return all.filter(
    (p) => p.exePath && path.resolve(p.exePath).toLowerCase().startsWith(prefix),
  );
}

/**
 * 以 taskkill /T /F 終止整棵程序樹。
 * 單純 process.kill(pid) 只會殺掉 PalServer.exe launcher,
 * 讓 PalServer-Win64-Shipping.exe 變成孤兒繼續佔用連接埠。
 */
export async function killTree(pid: number): Promise<boolean> {
  try {
    await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      timeout: 20000,
    });
    return true;
  } catch (e) {
    // 程序可能已經不存在
    return false;
  }
}

/**
 * 清除指定 server 資料夾底下所有殘留的伺服器程序。
 * 開服前呼叫可保證單一實例 (upstream issue #39 的重複程序問題)。
 */
export async function sweepServerProcesses(
  serverPath: string,
  excludePids: number[] = [],
): Promise<number> {
  const procs = await findProcessesUnderPath(serverPath);
  // eslint-disable-next-line no-restricted-syntax
  for (const p of procs) {
    if (!excludePids.includes(p.pid)) {
      // eslint-disable-next-line no-await-in-loop
      await killTree(p.pid);
    }
  }
  return procs.length;
}

/**
 * 解析 launcher (PalServer.exe) 底下真正的 Shipping 子程序 PID。
 * 子程序要幾秒後才會出現,所以帶重試。
 */
export async function resolveShippingPid(
  launcherPid: number | null,
  serverPath: string,
): Promise<number | null> {
  const prefix = `${path.resolve(serverPath).toLowerCase()}${path.sep}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const procs = await queryPalProcesses();
    const isShipping = (p: PalProcess) =>
      p.name.toLowerCase().startsWith('palserver-win64-shipping');
    const byParent = procs.find(
      (p) => isShipping(p) && launcherPid !== null && p.ppid === launcherPid,
    );
    if (byParent) return byParent.pid;
    const byPath = procs.find(
      (p) =>
        isShipping(p) &&
        p.exePath &&
        path.resolve(p.exePath).toLowerCase().startsWith(prefix),
    );
    if (byPath) return byPath.pid;
    // eslint-disable-next-line no-await-in-loop
    await sleep(5000);
  }
  return null;
}

/**
 * 讀取單一程序目前的實體記憶體用量 (bytes)。
 */
export async function getWorkingSetSize(pid: number): Promise<number | null> {
  const script = `Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" | Select-Object WorkingSetSize | ConvertTo-Json -Compress`;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        script,
      ],
      { windowsHide: true, timeout: 20000 },
    );
    const text = stdout.trim();
    if (!text) return null;
    const parsed = JSON.parse(text);
    return parsed?.WorkingSetSize ?? null;
  } catch (e) {
    return null;
  }
}
