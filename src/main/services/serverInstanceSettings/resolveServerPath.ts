import path from 'path';
import fsc from 'fs';
import { USER_SERVER_INSTANCES_PATH } from '../../constant';

/**
 * 解析伺服器實體的實際 server 資料夾。
 * 匯入的外部伺服器 (.pal 內含 ExternalServerPath) 直接使用該路徑,
 * 其餘維持 <instances>/<serverId>/server 的預設佈局。
 * 同步實作,preload 與 main 皆可共用。
 */
export default function resolveServerPath(serverId: string): string {
  const instancePath = path.join(USER_SERVER_INSTANCES_PATH, serverId);
  try {
    const pal = JSON.parse(
      fsc.readFileSync(path.join(instancePath, '.pal'), {
        encoding: 'utf-8',
      }),
    );
    if (pal.ExternalServerPath) {
      return pal.ExternalServerPath;
    }
  } catch (e) {
    // .pal 不存在或壞損時退回預設佈局
  }
  return path.join(instancePath, 'server');
}
