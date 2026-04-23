// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { describe, expect, test } from 'vitest';
import {
  createUploadFileSelection,
  type UploadFileSelectionFile,
} from '../src/ui/uploadFileSelection';

interface TestFile extends UploadFileSelectionFile {
  size: number;
}

const file = (name: string): TestFile => ({
  name,
  size: name.length,
});

describe('upload file selection', () => {
  test('should append dropped files to the current waiting list', () => {
    const currentFiles = [file('existing.zip')];
    const incomingFiles = [file('dropped.txt')];

    const result = createUploadFileSelection({
      currentFiles,
      incomingFiles,
      mode: 'append',
    });

    expect(
      result.selectedFiles.map((selectedFile) => selectedFile.name)
    ).toEqual(['existing.zip', 'dropped.txt']);
    expect(
      result.acceptedFiles.map((acceptedFile) => acceptedFile.name)
    ).toEqual(['dropped.txt']);
  });

  test('should replace the waiting list for browse selection', () => {
    const result = createUploadFileSelection({
      currentFiles: [file('existing.zip')],
      incomingFiles: [file('browsed.txt')],
      mode: 'replace',
    });

    expect(
      result.selectedFiles.map((selectedFile) => selectedFile.name)
    ).toEqual(['browsed.txt']);
  });

  test('should preserve the current waiting list for empty incoming files', () => {
    const result = createUploadFileSelection({
      currentFiles: [file('existing.zip')],
      incomingFiles: [],
      mode: 'append',
    });

    expect(
      result.selectedFiles.map((selectedFile) => selectedFile.name)
    ).toEqual(['existing.zip']);
    expect(result.acceptedFiles).toHaveLength(0);
  });
});
