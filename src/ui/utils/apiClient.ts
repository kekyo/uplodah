// uplodah - Universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

/**
 * Performs same-origin API requests with a normalized relative path.
 * @param input Relative or absolute same-origin path.
 * @param init Fetch options.
 * @returns Fetch response promise.
 */
export const apiFetch = (
  input: string,
  init?: RequestInit
): Promise<Response> =>
  fetch(input.startsWith('/') ? input : `/${input}`, init);
