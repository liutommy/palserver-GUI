import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import fsc from 'fs';
import { USER_SERVER_INSTANCES_PATH } from '../../constant';
import getServerInfoByServerId from '../../services/serverInstanceSettings/getServerInfoByServerId';
import resolveServerPath from '../../services/serverInstanceSettings/resolveServerPath';

const execFileAsync = promisify(execFile);

const BACKUP_RETENTION = 10;

/**
 * 備份 SaveGames 到 <instance>/backups/saves-<時間>.zip。
 * 只在伺服器已停止時呼叫 (重啟間隙),避免複製到寫入一半的存檔。
 * 壓縮失敗時退化為資料夾複製;保留最近 BACKUP_RETENTION 份。
 */
export default async function backupSaveGames(
  serverId: string,
): Promise<string | null> {
  const serverInfo = await getServerInfoByServerId(serverId);
  if (!(serverInfo.BackupOnRestart ?? true)) return null;

  const saveGamesPath = path.join(
    resolveServerPath(serverId),
    'Pal/Saved/SaveGames',
  );
  if (!fsc.existsSync(saveGamesPath)) return null;

  const backupDir = path.join(USER_SERVER_INSTANCES_PATH, serverId, 'backups');
  await fs.mkdir(backupDir, { recursive: true });

  const stamp = new Date()
    .toISOString()
    .slice(0, 19)
    .replace(/[T:]/g, '-');
  const destZip = path.join(backupDir, `saves-${stamp}.zip`);

  let created: string | null = null;
  try {
    // 單引號字串 + LiteralPath:路徑含 $ ` ( ) [ ] 等字元時不被 PowerShell 解讀
    const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;
    const script = `Compress-Archive -LiteralPath ${psQuote(
      saveGamesPath,
    )} -DestinationPath ${psQuote(destZip)} -CompressionLevel Optimal -Force`;
    await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        script,
      ],
      { windowsHide: true, timeout: 180000, maxBuffer: 10 * 1024 * 1024 },
    );
    created = destZip;
  } catch (e) {
    // 壓縮失敗 (逾時 / PowerShell 異常) → 先清掉寫到一半的 zip,再退化為資料夾複製
    await fs.rm(destZip, { force: true }).catch(() => {});
    try {
      const destDir = path.join(backupDir, `saves-${stamp}`);
      await fs.cp(saveGamesPath, destDir, { recursive: true, force: true });
      created = destDir;
    } catch (err) {
      return null;
    }
  }

  // 保留最近 N 份
  try {
    const entries = (await fs.readdir(backupDir))
      .filter((name) => name.startsWith('saves-'))
      .sort()
      .reverse();
    // eslint-disable-next-line no-restricted-syntax
    for (const stale of entries.slice(BACKUP_RETENTION)) {
      // eslint-disable-next-line no-await-in-loop
      await fs.rm(path.join(backupDir, stale), {
        recursive: true,
        force: true,
      });
    }
  } catch (e) {
    //
  }

  return created;
}
