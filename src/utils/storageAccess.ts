// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import { AuthMode, StorageDirectoryDescriptor } from '../types';

/**
 * Authenticated-user summary required for storage access decisions.
 */
interface CurrentUserSummary {
  username: string;
  role: string;
  authenticated: boolean;
}

const hasUploadCapability = (
  authMode: AuthMode,
  currentUser: CurrentUserSummary | null | undefined
): boolean => {
  if (authMode === 'none') {
    return true;
  }

  if (!currentUser?.authenticated) {
    return false;
  }

  return ['publish', 'admin'].includes(currentUser.role);
};

/**
 * Filter uploadable directories by the current user's effective capabilities.
 * @param authMode Server authentication mode.
 * @param currentUser Current authenticated user, if any.
 * @param directories Directories accepted for store operations.
 * @returns Uploadable directories visible to the user.
 */
export const filterUploadDirectoryDetailsByUserAccess = ({
  authMode,
  currentUser,
  directories,
}: {
  authMode: AuthMode;
  currentUser: CurrentUserSummary | null | undefined;
  directories: readonly StorageDirectoryDescriptor[];
}): StorageDirectoryDescriptor[] =>
  hasUploadCapability(authMode, currentUser) ? [...directories] : [];

/**
 * Decide whether the current user may delete a stored version.
 * @param authMode Server authentication mode.
 * @param currentUser Current authenticated user, if any.
 * @param uploadedBy Uploader recorded in version metadata.
 * @returns True when the version may be deleted.
 */
export const canDeleteStoredVersion = ({
  authMode,
  currentUser,
  uploadedBy,
}: {
  authMode: AuthMode;
  currentUser: CurrentUserSummary | null | undefined;
  uploadedBy: string | undefined;
}): boolean => {
  if (authMode === 'none') {
    return true;
  }

  if (!currentUser?.authenticated) {
    return false;
  }

  if (currentUser.role === 'admin') {
    return true;
  }

  return uploadedBy !== undefined && uploadedBy === currentUser.username;
};
