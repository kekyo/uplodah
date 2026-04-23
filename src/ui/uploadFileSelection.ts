// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

/**
 * File selection mode used by the upload drawer.
 */
export type UploadFileSelectionMode = 'replace' | 'append';

/**
 * Minimum file information required to build the upload waiting list.
 */
export interface UploadFileSelectionFile {
  /**
   * Name of the selected file.
   */
  name: string;
}

/**
 * Input values used to update the upload waiting list.
 */
export interface UploadFileSelectionInput<
  TFile extends UploadFileSelectionFile,
> {
  /**
   * Files that are already waiting for upload.
   */
  currentFiles: readonly TFile[];

  /**
   * Files selected by the latest browse or drop operation.
   */
  incomingFiles: readonly TFile[];

  /**
   * Whether incoming files replace or append to the current list.
   */
  mode: UploadFileSelectionMode;
}

/**
 * Result of applying an upload file selection operation.
 */
export interface UploadFileSelectionResult<
  TFile extends UploadFileSelectionFile,
> {
  /**
   * Files that should be shown in the upload waiting list.
   */
  selectedFiles: TFile[];

  /**
   * Files accepted from the incoming file list.
   */
  acceptedFiles: TFile[];
}

/**
 * Creates the next upload waiting list from an incoming file selection.
 * @param input Current waiting files, incoming files, and update mode.
 * @returns Updated waiting list information.
 */
export const createUploadFileSelection = <
  TFile extends UploadFileSelectionFile,
>(
  input: UploadFileSelectionInput<TFile>
): UploadFileSelectionResult<TFile> => {
  const acceptedFiles = [...input.incomingFiles];

  if (acceptedFiles.length === 0) {
    return {
      selectedFiles: [...input.currentFiles],
      acceptedFiles,
    };
  }

  return {
    selectedFiles:
      input.mode === 'append'
        ? [...input.currentFiles, ...acceptedFiles]
        : acceptedFiles,
    acceptedFiles,
  };
};
