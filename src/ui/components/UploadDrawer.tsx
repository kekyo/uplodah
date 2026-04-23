// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { useEffect, useRef, useState } from 'react';
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
  List,
  ListItemIcon,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CheckCircle as SuccessIcon,
  Clear as ClearIcon,
  Close as CloseIcon,
  CloudUpload as UploadIcon,
  Error as ErrorIcon,
  FileUpload as FileUploadIcon,
} from '@mui/icons-material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { TypedMessage, useTypedMessage } from 'typed-message';
import { messages } from '../../generated/messages';
import { apiFetch } from '../utils/apiClient';
import type { StorageDirectoryDescriptor } from '../../types';
import {
  createUploadFileSelection,
  type UploadFileSelectionMode,
} from '../uploadFileSelection';

interface UploadDrawerProps {
  open: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
  serverConfig?: {
    storageDirectories?: string[];
    storageDirectoryDetails?: StorageDirectoryDescriptor[];
  } | null;
}

interface UploadResult {
  fileName: string;
  success: boolean;
  uploadId?: string;
  publicPath?: string;
  message?: string;
  status: 'uploading' | 'success' | 'error';
}

interface UploadResultSummaryContentProps {
  fileName: string;
  uploadId: string | undefined;
}

interface UploadDirectoryOption extends StorageDirectoryDescriptor {}

const encodePublicPath = (publicPath: string): string =>
  publicPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const joinDirectoryAndFileName = (
  directoryPath: string,
  fileName: string
): string => {
  if (directoryPath === '/') {
    return fileName;
  }
  return `${directoryPath.replace(/^\/+/, '')}/${fileName}`;
};

/**
 * Normalize free-form upload tag input into a comma-delimited header value.
 * @param rawTags Free-form tag input from the UI.
 * @returns Comma-delimited tags or undefined when no tags were entered.
 */
export const normalizeUploadTagsInput = (
  rawTags: string
): string | undefined => {
  const tags = rawTags
    .split(/[\s,;]+/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

  return tags.length > 0 ? tags.join(',') : undefined;
};

/**
 * Build upload-directory options with optional descriptions for the UI.
 * @param storageDirectories Writable directory path list from the server.
 * @param storageDirectoryDetails Writable directory metadata from the server.
 * @returns Uploadable directory options in display order.
 */
export const buildUploadDirectoryOptions = (
  storageDirectories: readonly string[] | undefined,
  storageDirectoryDetails: readonly StorageDirectoryDescriptor[] | undefined
): UploadDirectoryOption[] => {
  if (storageDirectoryDetails && storageDirectoryDetails.length > 0) {
    return storageDirectoryDetails.map((directory) => ({
      directoryPath: directory.directoryPath,
      ...(directory.description !== undefined
        ? { description: directory.description }
        : {}),
    }));
  }

  return (storageDirectories ?? ['/']).map((directoryPath) => ({
    directoryPath,
  }));
};

/**
 * Tooltip-wrapped upload directory path label.
 * @param directoryPath Public virtual directory path.
 * @param description Optional tooltip text shown on hover.
 * @returns Label node for upload-directory selectors.
 */
export const UploadDirectoryTooltipLabel = ({
  directoryPath,
  description,
}: UploadDirectoryOption) => {
  return (
    <Tooltip
      title={description || ''}
      disableHoverListener={!description}
      describeChild
    >
      <Box
        component="span"
        sx={{
          display: 'block',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
        }}
      >
        {directoryPath}
      </Box>
    </Tooltip>
  );
};

/**
 * Summary content for an uploaded file result row.
 */
export const UploadResultSummaryContent = ({
  fileName,
  uploadId,
}: UploadResultSummaryContentProps) => {
  return (
    <Box sx={{ minWidth: 0, flexGrow: 1 }}>
      <Typography
        component="div"
        sx={{
          fontSize: '1rem',
          lineHeight: 1.5,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {fileName}
      </Typography>
      {uploadId && (
        <Typography
          component="div"
          variant="caption"
          color="text.secondary"
          sx={{
            mt: 0.25,
            display: 'block',
            overflowWrap: 'anywhere',
            wordBreak: 'break-all',
          }}
        >
          <TypedMessage
            message={messages.UPLOAD_ID_LABEL}
            params={{ uploadId }}
          />
        </Typography>
      )}
    </Box>
  );
};

/**
 * Upload tag input field.
 */
export const UploadTagsField = ({
  uploadTags,
  onChange,
}: {
  uploadTags: string;
  onChange: (value: string) => void;
}) => {
  const getMessage = useTypedMessage();

  return (
    <TextField
      fullWidth
      label={getMessage(messages.UPLOAD_TAGS)}
      value={uploadTags}
      onChange={(event) => onChange(event.target.value)}
      helperText={getMessage(messages.UPLOAD_TAGS_HELPER)}
      sx={{ mb: 3 }}
    />
  );
};

const UploadDrawer = ({
  open,
  onClose,
  onUploadSuccess,
  serverConfig,
}: UploadDrawerProps) => {
  const getMessage = useTypedMessage();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [currentUploadIndex, setCurrentUploadIndex] = useState<number>(-1);
  const [selectedDirectory, setSelectedDirectory] = useState('/');
  const [uploadTags, setUploadTags] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const uploadDirectoryOptions = buildUploadDirectoryOptions(
    serverConfig?.storageDirectories,
    serverConfig?.storageDirectoryDetails
  );
  const uploadDirectories = uploadDirectoryOptions.map(
    (directory) => directory.directoryPath
  );
  const selectedDirectoryOption =
    uploadDirectoryOptions.find(
      (directory) => directory.directoryPath === selectedDirectory
    ) ?? uploadDirectoryOptions[0];

  useEffect(() => {
    if (uploadDirectories.includes(selectedDirectory)) {
      return;
    }
    setSelectedDirectory(uploadDirectories[0] || '/');
  }, [selectedDirectory, uploadDirectories]);

  const handleFileSelection = (
    files: File[],
    mode: UploadFileSelectionMode
  ) => {
    const selection = createUploadFileSelection({
      currentFiles: selectedFiles,
      incomingFiles: files,
      mode,
    });

    if (selection.acceptedFiles.length > 0) {
      setSelectedFiles(selection.selectedFiles);
      setUploadResults([]);
      setCurrentUploadIndex(-1);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      handleFileSelection(Array.from(files), 'replace');
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0 || uploadDirectories.length === 0) {
      return;
    }

    setUploading(true);
    const results: UploadResult[] = [];
    const normalizedUploadTags = normalizeUploadTagsInput(uploadTags);

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      if (!file) {
        continue;
      }

      setCurrentUploadIndex(index);

      const result: UploadResult = {
        fileName: file.name,
        success: false,
        status: 'uploading',
      };

      try {
        setUploadResults([...results, result]);

        const fileBuffer = await file.arrayBuffer();
        const publicPath = joinDirectoryAndFileName(
          selectedDirectory,
          file.name
        );
        const response = await apiFetch(
          `api/upload/${encodePublicPath(publicPath)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
              ...(normalizedUploadTags
                ? { 'X-UPLODAH-TAGS': normalizedUploadTags }
                : {}),
            },
            body: fileBuffer,
            credentials: 'same-origin',
          }
        );

        if (response.ok) {
          const apiResult = await response.json();
          result.success = true;
          result.status = 'success';
          result.uploadId = apiResult.uploadId;
          result.publicPath = apiResult.path;
          result.message = `${apiResult.message}\nPath: ${apiResult.path}\nUpload ID: ${apiResult.uploadId}`;
        } else if (response.status === 401) {
          handleClose();
          return;
        } else {
          const errorText = await response.text();
          result.status = 'error';
          result.message = `Upload failed: ${response.status} ${response.statusText}\n${errorText}`;
        }
      } catch (error) {
        result.status = 'error';
        result.message = `${getMessage(messages.UPLOAD_ERROR)}: ${
          error instanceof Error
            ? error.message
            : getMessage(messages.UNKNOWN_ERROR)
        }`;
      }

      results.push(result);
      setUploadResults([...results]);
    }

    setUploading(false);
    setCurrentUploadIndex(-1);

    if (results.some((result) => result.success)) {
      onUploadSuccess();
    }
  };

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current += 1;
    if (event.dataTransfer.items && event.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current -= 1;
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
      handleFileSelection(Array.from(files), 'append');
    }
  };

  const handleClose = () => {
    setSelectedFiles([]);
    setUploading(false);
    setUploadResults([]);
    setCurrentUploadIndex(-1);
    setIsDragging(false);
    dragCounter.current = 0;
    onClose();
  };

  const resetForm = () => {
    setSelectedFiles([]);
    setUploadResults([]);
    setCurrentUploadIndex(-1);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((files) =>
      files.filter((_, current) => current !== index)
    );
  };

  const getTotalSize = () =>
    selectedFiles.reduce((total, file) => total + file.size, 0);

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
            <TypedMessage message={messages.UPLOAD_FILES_TITLE} />
          </Typography>
          <IconButton onClick={handleClose} edge="end">
            <CloseIcon />
          </IconButton>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {uploadResults.length === 0 ? (
          <Box>
            <Typography variant="body1" sx={{ mb: 2 }}>
              <TypedMessage message={messages.SELECT_UPLOAD_FILES} />
            </Typography>

            {uploadDirectories.length === 0 ? (
              <Alert severity="warning" sx={{ mb: 3 }}>
                <TypedMessage message={messages.NO_UPLOAD_DIRECTORIES} />
              </Alert>
            ) : (
              <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel id="upload-directory-label">
                  {getMessage(messages.UPLOAD_DIRECTORY)}
                </InputLabel>
                <Select
                  labelId="upload-directory-label"
                  value={selectedDirectory}
                  label={getMessage(messages.UPLOAD_DIRECTORY)}
                  renderValue={(directoryPath) => {
                    const directory = uploadDirectoryOptions.find(
                      (entry) => entry.directoryPath === directoryPath
                    );

                    return (
                      <UploadDirectoryTooltipLabel
                        directoryPath={String(directoryPath)}
                        description={directory?.description}
                      />
                    );
                  }}
                  onChange={(event) =>
                    setSelectedDirectory(event.target.value as string)
                  }
                >
                  {uploadDirectoryOptions.map((directory) => (
                    <MenuItem
                      key={directory.directoryPath}
                      value={directory.directoryPath}
                    >
                      <UploadDirectoryTooltipLabel
                        directoryPath={directory.directoryPath}
                        description={directory.description}
                      />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {selectedDirectoryOption?.description ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mb: 3, mt: -2 }}
              >
                {selectedDirectoryOption.description}
              </Typography>
            ) : null}
            <UploadTagsField uploadTags={uploadTags} onChange={setUploadTags} />

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
              onClick={() => document.getElementById('file-input')?.click()}
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
                  <TypedMessage message={messages.DROP_FILES_HERE} />
                </Typography>
              ) : (
                <>
                  <Typography variant="h6" color="text.primary" sx={{ mb: 1 }}>
                    <TypedMessage message={messages.DRAG_DROP_FILES} />
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    <TypedMessage message={messages.OR_CLICK_TO_BROWSE} />
                  </Typography>
                </>
              )}
            </Paper>

            <input
              id="file-input"
              type="file"
              multiple
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />

            {selectedFiles.length > 0 && (
              <Paper sx={{ p: 2, mb: 3 }} variant="outlined" elevation={0}>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 1 }}
                >
                  <TypedMessage
                    message={messages.SELECTED_FILES}
                    params={{
                      count: selectedFiles.length,
                      plural: selectedFiles.length !== 1 ? 's' : '',
                      size: (getTotalSize() / 1024 / 1024).toFixed(2),
                    }}
                  />
                  :
                </Typography>
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ flexWrap: 'wrap' }}
                >
                  {selectedFiles.map((file, index) => (
                    <Chip
                      key={`${file.name}-${index}`}
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
                  <TypedMessage
                    message={messages.UPLOADING_PROGRESS}
                    params={{
                      current: currentUploadIndex + 1,
                      total: selectedFiles.length,
                      fileName: selectedFiles[currentUploadIndex]?.name || '',
                    }}
                  />
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={(currentUploadIndex / selectedFiles.length) * 100}
                />
              </Box>
            )}

            <Button
              variant="contained"
              fullWidth
              startIcon={
                uploading ? <CircularProgress size={20} /> : <UploadIcon />
              }
              onClick={handleUpload}
              disabled={
                selectedFiles.length === 0 ||
                uploading ||
                uploadDirectories.length === 0
              }
              sx={{ mb: 2 }}
            >
              {uploading
                ? getMessage(messages.UPLOADING_N_OF_M, {
                    current: currentUploadIndex + 1,
                    total: selectedFiles.length,
                  })
                : getMessage(messages.UPLOAD_N_FILES, {
                    count: selectedFiles.length,
                    plural: selectedFiles.length !== 1 ? 's' : '',
                  })}
            </Button>
          </Box>
        ) : (
          <Box>
            <Box sx={{ mb: 3 }}>
              {uploadResults.filter((result) => result.status === 'success')
                .length === uploadResults.length ? (
                <Alert severity="success" icon={<SuccessIcon />}>
                  <TypedMessage
                    message={messages.ALL_UPLOADS_SUCCESS}
                    params={{
                      count: uploadResults.length,
                      plural: uploadResults.length !== 1 ? 's' : '',
                    }}
                  />
                </Alert>
              ) : uploadResults.filter((result) => result.status === 'error')
                  .length === uploadResults.length ? (
                <Alert severity="error" icon={<ErrorIcon />}>
                  <TypedMessage message={messages.ALL_UPLOADS_FAILED} />
                </Alert>
              ) : (
                <Alert severity="warning">
                  <TypedMessage
                    message={messages.PARTIAL_UPLOAD_SUCCESS}
                    params={{
                      success: uploadResults.filter(
                        (result) => result.status === 'success'
                      ).length,
                      total: uploadResults.length,
                      plural: uploadResults.length !== 1 ? 's' : '',
                    }}
                  />
                </Alert>
              )}
            </Box>

            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              <TypedMessage message={messages.UPLOAD_RESULTS} />
            </Typography>

            <List sx={{ mb: 3 }}>
              {uploadResults.map((result, index) => (
                <Accordion
                  key={`${result.fileName}-${index}`}
                  defaultExpanded={result.status === 'error'}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreIcon />}
                    sx={{
                      alignItems: 'flex-start',
                      '& .MuiAccordionSummary-content': {
                        alignItems: 'flex-start',
                        minWidth: 0,
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40 }}>
                      {result.status === 'success' ? (
                        <SuccessIcon color="success" />
                      ) : result.status === 'error' ? (
                        <ErrorIcon color="error" />
                      ) : (
                        <CircularProgress size={20} />
                      )}
                    </ListItemIcon>
                    <UploadResultSummaryContent
                      fileName={result.fileName}
                      uploadId={result.uploadId}
                    />
                  </AccordionSummary>
                  {result.message && (
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
                          }}
                        >
                          {result.message}
                        </Typography>
                      </Paper>
                    </AccordionDetails>
                  )}
                </Accordion>
              ))}
            </List>

            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outlined" onClick={resetForm} sx={{ flex: 1 }}>
                <TypedMessage message={messages.UPLOAD_MORE} />
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Drawer>
  );
};

export default UploadDrawer;
