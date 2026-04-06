// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import ClearIcon from '@mui/icons-material/Clear';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import type { UploadDirectory, UploadResponse } from '../../types';
import { apiFetch } from '../utils/apiClient';
import { buildUploadRequestPath } from '../utils/uploadFileName';

interface UploadDrawerProps {
  open: boolean;
  onClose: () => void;
  onUploadSuccess: () => Promise<void>;
  uploadDirectories: UploadDirectory[];
  uploadDirectoriesLoading: boolean;
  uploadDirectoriesError: string | undefined;
}

interface UploadResult {
  fileName: string;
  success: boolean;
  message?: string;
  uploadedAt?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
}

const formatUploadTimestamp = (
  uploadedAt: string | undefined
): string | undefined =>
  uploadedAt ? dayjs(uploadedAt).format('YYYY/MM/DD HH:mm:ss') : undefined;

const getDefaultDirectoryPath = (
  uploadDirectories: UploadDirectory[]
): string => uploadDirectories[0]?.path ?? '';

const formatDirectoryLabel = (directoryPath: string): string =>
  directoryPath === '/' ? 'Root (/)' : directoryPath;

const formatDirectoryDescription = (
  uploadDirectory: UploadDirectory | undefined
): string => {
  if (!uploadDirectory) {
    return 'No upload destination is available.';
  }

  if (uploadDirectory.expireSeconds === undefined) {
    return uploadDirectory.path === '/'
      ? 'Files are stored at the storage root without automatic expiration.'
      : `Files are stored under ${uploadDirectory.path} without automatic expiration.`;
  }

  return uploadDirectory.path === '/'
    ? `Files are stored at the storage root and expire automatically after ${uploadDirectory.expireSeconds} seconds.`
    : `Files are stored under ${uploadDirectory.path} and expire automatically after ${uploadDirectory.expireSeconds} seconds.`;
};

const UploadDrawer = ({
  open,
  onClose,
  onUploadSuccess,
  uploadDirectories,
  uploadDirectoriesLoading,
  uploadDirectoriesError,
}: UploadDrawerProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [currentUploadIndex, setCurrentUploadIndex] = useState<number>(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedDirectoryPath, setSelectedDirectoryPath] = useState<string>(
    getDefaultDirectoryPath(uploadDirectories)
  );
  const dragCounter = useRef(0);

  useEffect(() => {
    setSelectedDirectoryPath((currentDirectoryPath) =>
      uploadDirectories.some(
        (uploadDirectory) => uploadDirectory.path === currentDirectoryPath
      )
        ? currentDirectoryPath
        : getDefaultDirectoryPath(uploadDirectories)
    );
  }, [uploadDirectories]);

  const handleFileSelection = (files: File[]) => {
    if (files.length > 0) {
      setSelectedFiles(files);
      setUploadResults([]);
      setCurrentUploadIndex(-1);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleFileSelection(Array.from(files));
    }
  };

  const handleUpload = async () => {
    const resolvedDirectoryPath =
      selectedDirectoryPath || getDefaultDirectoryPath(uploadDirectories);
    if (selectedFiles.length === 0 || resolvedDirectoryPath.length === 0)
      return;

    setUploading(true);
    const results: UploadResult[] = [];

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      if (!file) continue;

      setCurrentUploadIndex(i);

      const result: UploadResult = {
        fileName: file.name,
        success: false,
        status: 'uploading',
      };

      try {
        setUploadResults([...results, result]);

        const fileBuffer = await file.arrayBuffer();
        const response = await apiFetch(
          buildUploadRequestPath(file.name, resolvedDirectoryPath),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
            },
            body: fileBuffer,
          }
        );

        if (response.ok) {
          const apiResult = (await response.json()) as UploadResponse;
          result.success = true;
          result.status = 'success';
          result.uploadedAt = apiResult.file.uploadedAt;
          result.message = `${apiResult.message}\nStored: ${apiResult.file.uploadId}`;
        } else {
          const errorText = await response.text();
          result.status = 'error';
          result.message = `Upload failed: ${response.status} ${response.statusText}\n${errorText}`;
        }
      } catch (error) {
        result.status = 'error';
        result.message = `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }

      results.push(result);
      setUploadResults([...results]);
    }

    setUploading(false);
    setCurrentUploadIndex(-1);

    if (results.some((entry) => entry.success)) {
      await onUploadSuccess();
    }
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current++;
    if (event.dataTransfer.items && event.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelection(Array.from(files));
    }
  };

  const handleClose = () => {
    setSelectedFiles([]);
    setUploading(false);
    setUploadResults([]);
    setCurrentUploadIndex(-1);
    setIsDragging(false);
    setSelectedDirectoryPath(getDefaultDirectoryPath(uploadDirectories));
    dragCounter.current = 0;
    onClose();
  };

  const resetForm = () => {
    setSelectedFiles([]);
    setUploadResults([]);
    setCurrentUploadIndex(-1);
    setSelectedDirectoryPath(getDefaultDirectoryPath(uploadDirectories));
  };

  const removeFile = (index: number) => {
    setSelectedFiles((files) =>
      files.filter((_, currentIndex) => currentIndex !== index)
    );
  };

  const getTotalSize = () =>
    selectedFiles.reduce((total, file) => total + file.size, 0);

  const selectedUploadDirectory =
    uploadDirectories.find(
      (uploadDirectory) => uploadDirectory.path === selectedDirectoryPath
    ) ?? uploadDirectories[0];

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={handleClose}
      variant="temporary"
      sx={{
        width: 400,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: 400,
          boxSizing: 'border-box',
        },
      }}
    >
      <Box
        sx={{ p: 3, height: '100%' }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 3,
          }}
        >
          <Typography variant="h6" component="h2">
            Upload Files
          </Typography>
          <IconButton onClick={handleClose} edge="end">
            <CloseIcon />
          </IconButton>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {uploadResults.length === 0 ? (
          <Box>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Select files to upload.
            </Typography>

            <Paper
              sx={{
                p: 4,
                mb: 3,
                textAlign: 'center',
                border: isDragging ? '2px dashed #2196f3' : '2px dashed #ccc',
                backgroundColor: isDragging
                  ? (theme) =>
                      theme.palette.mode === 'dark'
                        ? 'rgba(33, 150, 243, 0.1)'
                        : 'rgba(33, 150, 243, 0.05)'
                  : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                '&:hover': {
                  backgroundColor: (theme) =>
                    theme.palette.mode === 'dark'
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(0, 0, 0, 0.02)',
                  borderColor: '#999',
                },
              }}
              variant="outlined"
              elevation={0}
              onClick={() => inputRef.current?.click()}
            >
              <FileUploadIcon
                sx={{
                  fontSize: 48,
                  color: isDragging ? '#2196f3' : 'text.secondary',
                  mb: 2,
                  transition: 'color 0.3s ease',
                }}
              />

              {isDragging ? (
                <Typography variant="h6" color="primary" sx={{ mb: 1 }}>
                  Drop files here
                </Typography>
              ) : (
                <>
                  <Typography variant="h6" color="text.primary" sx={{ mb: 1 }}>
                    Drag & drop files
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Or click to browse
                  </Typography>
                </>
              )}
            </Paper>

            <TextField
              id="file-input"
              type="file"
              fullWidth
              variant="outlined"
              slotProps={{
                htmlInput: {
                  multiple: true,
                },
              }}
              inputRef={inputRef}
              onChange={handleFileChange}
              sx={{ display: 'none' }}
            />

            {selectedFiles.length > 0 && (
              <Paper sx={{ p: 2, mb: 3 }} variant="outlined" elevation={0}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 1 }}
                >
                  {selectedFiles.length} file
                  {selectedFiles.length !== 1 ? 's' : ''} selected (
                  {(getTotalSize() / 1024 / 1024).toFixed(2)} MB):
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {selectedFiles.map((file, index) => (
                    <Chip
                      key={`${file.name}-${file.size}-${index}`}
                      label={file.name}
                      onDelete={() => removeFile(index)}
                      deleteIcon={<ClearIcon />}
                      size="small"
                      sx={{ mb: 1 }}
                    />
                  ))}
                </Stack>
              </Paper>
            )}

            {uploading && currentUploadIndex >= 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 1 }}
                >
                  Uploading {currentUploadIndex + 1} / {selectedFiles.length}:{' '}
                  {selectedFiles[currentUploadIndex]?.name || ''}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={(currentUploadIndex / selectedFiles.length) * 100}
                />
              </Box>
            )}

            {uploadDirectoriesError ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {uploadDirectoriesError}
              </Alert>
            ) : null}

            <FormControl
              fullWidth
              sx={{ mb: 1 }}
              disabled={
                uploading ||
                uploadDirectoriesLoading ||
                uploadDirectories.length === 0
              }
            >
              <InputLabel id="upload-directory-select-label">
                Upload directory
              </InputLabel>
              <Select
                labelId="upload-directory-select-label"
                value={selectedDirectoryPath}
                label="Upload directory"
                onChange={(event) =>
                  setSelectedDirectoryPath(String(event.target.value))
                }
              >
                {uploadDirectories.map((uploadDirectory) => (
                  <MenuItem
                    key={uploadDirectory.path}
                    value={uploadDirectory.path}
                  >
                    {formatDirectoryLabel(uploadDirectory.path)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The selected directory and file name are embedded in the upload
              request URL.
              {uploadDirectoriesLoading
                ? ' Upload destinations are loading.'
                : ` ${formatDirectoryDescription(selectedUploadDirectory)}`}
            </Typography>

            <Button
              variant="contained"
              fullWidth
              startIcon={
                uploading ? <CircularProgress size={20} /> : <CloudUploadIcon />
              }
              onClick={() => void handleUpload()}
              disabled={
                selectedFiles.length === 0 ||
                uploading ||
                uploadDirectoriesLoading ||
                uploadDirectories.length === 0
              }
              sx={{ mb: 2 }}
            >
              {uploading
                ? `Uploading ${currentUploadIndex + 1} / ${selectedFiles.length}`
                : `Upload ${selectedFiles.length} file${selectedFiles.length !== 1 ? 's' : ''}`}
            </Button>
          </Box>
        ) : (
          <Box>
            <Box sx={{ mb: 3 }}>
              {uploadResults.filter((result) => result.status === 'success')
                .length === uploadResults.length ? (
                <Alert severity="success" icon={<CheckCircleIcon />}>
                  All uploads completed successfully.
                </Alert>
              ) : uploadResults.filter((result) => result.status === 'error')
                  .length === uploadResults.length ? (
                <Alert severity="error" icon={<ErrorIcon />}>
                  All uploads failed.
                </Alert>
              ) : (
                <Alert severity="warning">
                  {
                    uploadResults.filter(
                      (result) => result.status === 'success'
                    ).length
                  }{' '}
                  / {uploadResults.length} uploads succeeded.
                </Alert>
              )}
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Upload results
            </Typography>

            <Box
              sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 1 }}
            >
              {uploadResults.map((result, index) => (
                <Accordion
                  key={`${result.fileName}-${result.status}-${index}`}
                  defaultExpanded={result.status === 'error'}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{
                      '& .MuiAccordionSummary-content': {
                        marginY: 1,
                      },
                    }}
                  >
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 1.5,
                        width: '100%',
                        minWidth: 0,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 24,
                          flexShrink: 0,
                          color: 'text.secondary',
                        }}
                      >
                        {result.status === 'success' ? (
                          <CheckCircleIcon color="success" />
                        ) : result.status === 'error' ? (
                          <ErrorIcon color="error" />
                        ) : result.status === 'uploading' ? (
                          <CircularProgress size={20} />
                        ) : null}
                      </Box>
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography
                          sx={{
                            fontWeight: 500,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {result.fileName}
                        </Typography>
                        {result.uploadedAt ? (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: 'block',
                              mt: 0.25,
                            }}
                          >
                            Uploaded at:{' '}
                            {formatUploadTimestamp(result.uploadedAt)}
                          </Typography>
                        ) : null}
                      </Box>
                    </Box>
                  </AccordionSummary>
                  {result.message ? (
                    <AccordionDetails>
                      <Paper
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          backgroundColor: (theme) =>
                            theme.palette.mode === 'dark'
                              ? 'rgba(255, 255, 255, 0.05)'
                              : 'rgba(0, 0, 0, 0.02)',
                        }}
                        variant="outlined"
                        elevation={0}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            whiteSpace: 'pre-wrap',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {result.message}
                        </Typography>
                      </Paper>
                    </AccordionDetails>
                  ) : null}
                </Accordion>
              ))}
            </Box>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outlined" onClick={resetForm} sx={{ flex: 1 }}>
                Upload More
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Drawer>
  );
};

export default UploadDrawer;
