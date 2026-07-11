import React, { useEffect, useState } from 'react';
import Channels from '../../../../main/ipcs/channels';
import useSelectedServerInstance from '../../../redux/selectedServerInstance/useSelectedServerInstance';
import useTranslation from '../../../hooks/translation/useTranslation';
import { AlertDialog, Badge, Button, Select, Theme } from '@radix-ui/themes';
import Boardcastbar from './Boardcastbar/Boardcastbar';

const logSheet = [
  ['(chat)', ''],
  ['[info]', ''],
  [/\/adminpassword .+/gu, '/adminpassword ***'],
  ['isPVPEnabled = False', 'PVP Mode = False'],
  // ['invoked', '調用'],
  // ['args', '參數'],
  // ['has logged in with', '登入 > '],
  // ['has logged out', '已登出'],
];

const applySheet = (log: string) => {
  let result = log;

  logSheet.forEach((sheet) => {
    result = result.replaceAll(sheet[0], sheet[1]);
  });

  return result;
};

type LogSource = 'console' | 'palguard' | 'crashes';

export default function ServerLog({
  managementMode,
  onNewLog,
}: {
  managementMode: string;
  onNewLog: (logCount: number) => void;
}) {
  const { t } = useTranslation();

  const { selectedServerInstance } = useSelectedServerInstance();

  const [source, setSource] = useState<LogSource>('console');
  const [log, setLog] = useState<string[]>([]);
  const [crashes, setCrashes] = useState<{
    crashesPath: string;
    dumps: { name: string; mtimeMs: number }[];
  } | null>(null);

  // PalDefender 插件日誌 (原有行為)
  useEffect(() => {
    if (source !== 'palguard') return undefined;
    window.electron.ipcRenderer.sendMessage(
      Channels.getServerLog,
      selectedServerInstance,
    );

    const getLog = window.electron.ipcRenderer.on(
      Channels.getServerLogReply.DATA,
      (data: string) => {
        setLog(applySheet(data).split('\n').slice(42));
      },
    );
    return () => {
      getLog();
    };
  }, [selectedServerInstance, source]);

  // 伺服器主控台輸出 (watchdog 擷取的 stdout;先載歷史再即時串流)
  useEffect(() => {
    if (source !== 'console') return undefined;
    let cancelled = false;
    setLog([]);
    window.electron.ipcRenderer
      .invoke(Channels.getConsoleLog, selectedServerInstance)
      .then((content: string) => {
        if (!cancelled) {
          setLog(content ? content.split('\n').filter(Boolean) : []);
        }
        return content;
      })
      .catch(() => {});

    const offData = window.electron.ipcRenderer.on(
      Channels.execStartServerReply.DATA,
      (serverId: string, chunk: string) => {
        if (serverId !== selectedServerInstance) return;
        const lines = String(chunk).split('\n').filter(Boolean);
        if (lines.length) {
          setLog((prev) => [...prev, ...lines].slice(-2000));
        }
      },
    );
    return () => {
      cancelled = true;
      offData();
    };
  }, [selectedServerInstance, source]);

  // 崩潰紀錄 (Pal/Saved/Crashes)
  useEffect(() => {
    if (source !== 'crashes') return undefined;
    let cancelled = false;
    window.electron.ipcRenderer
      .invoke(Channels.getCrashDumps, selectedServerInstance)
      .then((result: any) => {
        if (!cancelled) setCrashes(result);
        return result;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedServerInstance, source]);

  const [prevLog, setPrevLog] = useState<string[]>([]);
  useEffect(() => {
    if (managementMode === 'log') {
      setPrevLog(log);
    }
  }, [managementMode, log]);

  useEffect(() => {
    onNewLog(log.length - prevLog.length);
  }, [log.length, prevLog.length]);

  return (
    <AlertDialog.Root>
      <div className="my-4 flex flex-col gap-4">
        <Theme appearance="dark" style={{ background: 'inherit' }}>
          <div className="flex items-center gap-3">
            <Select.Root
              size="2"
              value={source}
              onValueChange={(v) => setSource(v as LogSource)}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="console">
                  {t('LogSourceConsole')}
                </Select.Item>
                <Select.Item value="palguard">
                  {t('LogSourcePalguard')}
                </Select.Item>
                <Select.Item value="crashes">
                  {t('LogSourceCrashes')}
                </Select.Item>
              </Select.Content>
            </Select.Root>
            {source === 'crashes' && crashes && (
              <Button
                size="2"
                variant="surface"
                onClick={() => {
                  window.electron.openExplorer(crashes.crashesPath);
                }}
              >
                {t('OpenCrashFolder')}
              </Button>
            )}
          </div>
        </Theme>
        <div className="w-full h-[calc(100vh-330px)] overflow-y-scroll rounded-md">
          {source === 'crashes' ? (
            <Theme appearance="dark" style={{ background: 'inherit' }}>
              {crashes && crashes.dumps.length ? (
                <div className="flex flex-col gap-2 p-4">
                  {crashes.dumps.map((dump) => (
                    <div
                      key={dump.name}
                      className="font-mono flex items-center gap-3"
                    >
                      <Badge color="red" variant="soft">
                        crash
                      </Badge>
                      <span>{new Date(dump.mtimeMs).toLocaleString()}</span>
                      <span className="opacity-60">{dump.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-2xl opacity-60 p-4">
                  {t('NoCrashDumps')}
                </div>
              )}
            </Theme>
          ) : log.length ? (
            <div className="flex flex-col-reverse gap-2 p-4">
              {log
                .slice()
                .reverse()
                .map((l) => (
                  <div className="font-mono">{l}</div>
                ))}
            </div>
          ) : (
            <div>
              <div className="text-2xl opacity-60 p-4">
                {t('ServerHasNoLog')}
              </div>
            </div>
          )}
        </div>
        <Boardcastbar />
      </div>
    </AlertDialog.Root>
  );
}
