// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

/**
 * Resolves the post-login destination on the server's origin.
 * @param page - Current login page URL.
 * @param requested - Root-relative path from the login URL, including any query and fragment.
 * @returns An absolute, same-origin URL, defaulting to the server root.
 */
export const resolveLoginRedirect = (
  page: string,
  requested: string | null
): string => {
  const root = new URL('/', page);
  if (
    !requested?.startsWith('/') ||
    requested.startsWith('//') ||
    requested.includes('\\')
  )
    return root.href;
  try {
    const target = new URL(requested, root);
    if (target.origin === root.origin)
      return root.origin + target.pathname + target.search + target.hash;
  } catch {
    // Malformed destinations return the user to the server.
  }
  return root.href;
};
