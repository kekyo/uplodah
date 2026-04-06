// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { useEffect, useRef, useState } from 'react';
import {
  AppBar,
  Alert,
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  Toolbar,
  Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import RefreshIcon from '@mui/icons-material/Refresh';
import type {
  AppConfigResponse,
  UploadDirectoriesResponse,
  UploadDirectory,
} from '../types';
import FileGroupList, { FileGroupListRef } from './FileGroupList';
import ApiExamplesAccordion from './components/ApiExamplesAccordion';
import AppHeaderIcon from './components/AppHeaderIcon';
import UploadDrawer from './components/UploadDrawer';
import { apiFetch } from './utils/apiClient';
import { buildApiCommandExamples } from './utils/commandExamples';

const AppContent = () => {
  const [config, setConfig] = useState<AppConfigResponse | undefined>(
    undefined
  );
  const [configError, setConfigError] = useState<string | undefined>(undefined);
  const [uploadDirectories, setUploadDirectories] = useState<UploadDirectory[]>(
    []
  );
  const [uploadDirectoriesError, setUploadDirectoriesError] = useState<
    string | undefined
  >(undefined);
  const [uploadDirectoriesLoading, setUploadDirectoriesLoading] =
    useState(true);
  const [uploadDrawerOpen, setUploadDrawerOpen] = useState(false);
  const fileGroupListRef = useRef<FileGroupListRef | null>(null);

  const loadConfig = async (): Promise<void> => {
    let response = await apiFetch('api/config', {
      credentials: 'same-origin',
    });
    if (!response.ok && response.status === 404) {
      response = await apiFetch('api/ui/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        credentials: 'same-origin',
      });
    }

    if (!response.ok) {
      throw new Error(
        `Failed to load config: ${response.status} ${response.statusText}`
      );
    }

    const responseBody = (await response.json()) as AppConfigResponse;
    setConfig(responseBody);
    setConfigError(undefined);
    document.title = responseBody.realm;
  };

  const loadUploadDirectories = async (): Promise<void> => {
    setUploadDirectoriesLoading(true);

    try {
      let response = await apiFetch('api/upload/directories', {
        credentials: 'same-origin',
      });
      if (!response.ok && response.status === 404) {
        response = await apiFetch('api/ui/upload/directories', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
          credentials: 'same-origin',
        });
      }

      if (!response.ok) {
        throw new Error(
          `Failed to load upload directories: ${response.status} ${response.statusText}`
        );
      }

      const responseBody = (await response.json()) as UploadDirectoriesResponse;
      setUploadDirectories(responseBody.directories);
      setUploadDirectoriesError(undefined);
    } finally {
      setUploadDirectoriesLoading(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      const [configResult, uploadDirectoriesResult] = await Promise.allSettled([
        loadConfig(),
        loadUploadDirectories(),
      ]);

      if (configResult.status === 'rejected') {
        setConfigError(
          configResult.reason instanceof Error
            ? configResult.reason.message
            : 'Failed to load config'
        );
      }

      if (uploadDirectoriesResult.status === 'rejected') {
        setUploadDirectoriesError(
          uploadDirectoriesResult.reason instanceof Error
            ? uploadDirectoriesResult.reason.message
            : 'Failed to load upload directories'
        );
      }
    };

    void initialize();
  }, []);

  const apiExamples = config ? buildApiCommandExamples(config.serverUrl) : [];

  const copyText = async (value: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = value;
      document.body.appendChild(textArea);
      textArea.select();
      // @prettier-max-ignore-deprecated
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="fixed">
        <Toolbar>
          <AppHeaderIcon />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            {config?.realm || 'uplodah'}
          </Typography>

          <IconButton
            color="inherit"
            onClick={() => void fileGroupListRef.current?.refresh()}
          >
            <RefreshIcon />
          </IconButton>

          <Divider
            orientation="vertical"
            flexItem
            sx={{ mx: 1, borderColor: 'rgba(255, 255, 255, 0.3)' }}
          />
          <Button
            color="inherit"
            startIcon={<CloudUploadIcon />}
            onClick={() => setUploadDrawerOpen(true)}
          >
            Upload
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 12, mb: 4 }}>
        <ApiExamplesAccordion
          apiExamples={apiExamples}
          loading={!config}
          onCopy={(value) => void copyText(value)}
        />

        {configError ? <Alert severity="error">{configError}</Alert> : null}

        <FileGroupList
          ref={fileGroupListRef}
          storageConfigured={config?.storageConfigured ?? false}
          storageSections={config?.storageSections ?? [{ path: '/' }]}
        />
      </Container>

      <UploadDrawer
        open={uploadDrawerOpen}
        onClose={() => setUploadDrawerOpen(false)}
        onUploadSuccess={async () => {
          await fileGroupListRef.current?.refresh();
        }}
        uploadDirectories={uploadDirectories}
        uploadDirectoriesLoading={uploadDirectoriesLoading}
        uploadDirectoriesError={uploadDirectoriesError}
      />
    </Box>
  );
};

export default AppContent;
