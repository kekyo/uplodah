// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

/** Maximum requests to each login route per client IP in one minute. */
export const loginRateLimit = { max: 20 };

/** Maximum Unicode code points in a password accepted by the login API. */
export const maxLoginPasswordLength = 1024;

/** Authentication forms are small, independent of the upload limit. */
export const loginBodyLimit = 16 * 1024;

/** Allow UI reads and file downloads to arrive in bursts. */
export const publicReadRateLimit = { max: 600 };

/** Maximum uploads or archive creations per client IP per minute on each route. */
export const transferRateLimit = { max: 120 };
