import { AlertDialog, Button, Code, Flex, Text } from '@radix-ui/themes';
import { useState } from 'react';
import useTranslation from '../../../hooks/translation/useTranslation';
import Channels from '../../../../main/ipcs/channels';
import Link from '../../Link';
import useOnlineLinksMap from '../../../hooks/firebase/useOnlineLinksMap';
import useSelectedServerInstance from '../../../redux/selectedServerInstance/useSelectedServerInstance';

type ValidationState =
  | 'idle'
  | 'valid'
  | 'INVALID_PATH'
  | 'ALREADY_IMPORTED';

export default function ImportServer() {
  const { t } = useTranslation();
  const { setSelectedServerInstance } = useSelectedServerInstance();

  const [selectedPath, setSelectedPath] = useState<string>('');
  const [validation, setValidation] = useState<ValidationState>('idle');

  const howToImportFourPlayerSavesLink = useOnlineLinksMap(
    'HowToImportFourPlayerSaves',
  );

  const handleSelectFolder = async () => {
    const folder = await window.electron.selectFolder();
    if (!folder) return;
    setSelectedPath(folder);

    // 預檢:資料夾必須包含 PalServer.exe 且尚未被匯入過
    const result = await window.electron.ipcRenderer.invoke(
      Channels.importServerInstance,
      folder,
      { validateOnly: true },
    );
    setValidation(result?.error ?? 'valid');
  };

  const handleImport = async () => {
    const result = await window.electron.ipcRenderer.invoke(
      Channels.importServerInstance,
      selectedPath,
    );
    if (result?.serverId) {
      setSelectedServerInstance(result.serverId);
    }
  };

  return (
    <AlertDialog.Content style={{ maxWidth: 480 }}>
      <AlertDialog.Title>{t('ImportLocalServer')}</AlertDialog.Title>
      <div className="flex flex-col gap-3 py-2">
        <Text color="gray" size="2">
          {t('ImportLocalServerDesc')}
        </Text>
        <Flex gap="3" align="center">
          <Button variant="surface" onClick={handleSelectFolder}>
            {t('SelectServerFolder')}
          </Button>
          {selectedPath && (
            <Code size="2" variant="ghost" className="break-all">
              {selectedPath}
            </Code>
          )}
        </Flex>
        {validation === 'INVALID_PATH' && (
          <Text color="red" size="2">
            {t('ImportServerInvalidPath')}
          </Text>
        )}
        {validation === 'ALREADY_IMPORTED' && (
          <Text color="red" size="2">
            {t('ImportServerAlreadyImported')}
          </Text>
        )}
        <Text color="gray" size="1">
          <Link href={howToImportFourPlayerSavesLink} appearance="light">
            {t('HowToImportFourPlayerSaves')}
          </Link>
        </Text>
      </div>
      <Flex gap="3" mt="4" justify="end">
        <AlertDialog.Cancel>
          <Button variant="soft" color="gray">
            {t('Cancel')}
          </Button>
        </AlertDialog.Cancel>
        <AlertDialog.Action>
          <Button
            disabled={validation !== 'valid'}
            onClick={handleImport}
            variant="solid"
            color="yellow"
          >
            {t('Import')}
          </Button>
        </AlertDialog.Action>
      </Flex>
    </AlertDialog.Content>
  );
}
