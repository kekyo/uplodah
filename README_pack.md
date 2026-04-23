# uplodah

Simple and modern universal file upload/download server.

![uplodah](./images/uplodah-120.png)

[![Project Status: Active – The project has reached a stable, usable state and is being actively developed.](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker Image Version](https://img.shields.io/docker/v/kekyo/uplodah.svg?label=docker)](https://hub.docker.com/r/kekyo/uplodah)

---

## What Is This?

There are many situations, especially in private environments, where you want to host simple file exchange on your own server.
Sharing files with friends, small-office coworkers, or even customers often falls into this category.

Today, cloud storage is the common answer.
At the same time, placing confidential files in cloud storage, even temporarily, may feel uncomfortable, or may be prohibited by strict organizational policy.

So how do you handle simple file upload and download without turning it into a large infrastructure task?
Do you prepare Apache or Nginx, manually tune it, enable WebDAV, then decide what clients should use and how users will browse the stored files?

This "uplodah" may be what you are looking for.
It is a simple server implementation built on Node.js, focused specifically on uploading and downloading files.

Setup is very easy, and zero-config operation is possible in many cases.
There is no database to manage.
If you need backups, just copy the storage subdirectory as files.
Restoring it is equally straightforward and does not require any special tooling.

It also provides a modern browser-based UI:

![Browse](./images/browse.png)

- Browse uploaded files.
- Search and organize them by file name or virtual directory.
- Check download URLs for the latest version or a specific version.
- Upload multiple files with drag and drop.
- Copy ready-to-use `curl` API examples from the UI.

### Key Features

- **Quick setup, start an upload server in seconds**
- No database required: uploaded files and metadata are managed directly on the filesystem
- Simple upload API: just send `application/octet-stream` with `POST` or `PUT`
- Versioned storage: re-uploading the same file name keeps history
- Flexible downloads: retrieve either the latest version or a specific upload ID directly
- Modern Web UI:
  - File list, search, and expandable version view
  - Sectioned display by virtual directory
  - Multiple file upload
  - Copyable API command examples
  - Download selected files in bulk
- Virtual storage rules:
  - Per-directory read-only control
  - Per-directory expiration rules
- Authentication: protect uploads only or the whole server with UI login, user roles, and API passwords
- Supports reverse proxies and subpath hosting
- Docker image available
- Health check endpoint at `/health`

## Requirements

Node.js 20.19.0 or later

Used stack: Node.js, TypeScript, Vite, Vitest, prettier-max, screw-up, Fastify, React, React MUI, dayjs, JSON5, async-primitives

---

## Installation

If [Node.js](https://nodejs.org/ja/download) is not installed on your system yet, install it first.

```bash
$ node --version
v24.11.1
```

Once Node.js is available, install `uplodah` with npm:

```bash
$ npm install -g uplodah

added 157 packages in 8s

42 packages are looking for funding
  run `npm fund` for details
```

You can also run it directly via `npx`:

```bash
$ npx uplodah
Need to install the following packages:
uplodah@0.1.0
Ok to proceed? (y)

[uplodah]: [2026/04/07 14:25:56.966]: [info]: uplodah [0.1.0] Starting...
[uplodah]: [2026/04/07 14:25:56.967]: [info]: Config file: ./config.json
[uplodah]: [2026/04/07 14:25:56.967]: [info]: Port: 5968
[uplodah]: [2026/04/07 14:25:56.967]: [info]: Base URL: http://localhost:5968 (auto-detected)
[uplodah]: [2026/04/07 14:25:56.967]: [info]: Storage directory: ./storage

    :
    :
```

## Usage

Here are a few examples:

```bash
# Start the server on the default port 5968
uplodah

# Custom port and storage directory
uplodah --port 3000 --storage-dir ./storage

# Fix the public base URL behind a reverse proxy
uplodah --base-url https://files.example.com/uplodah

# Combine multiple options
uplodah --port 3000 \
  --storage-dir ./storage \
  --config-file ./config.json \
  --max-upload-size-mb 500 \
  --max-download-size-mb 500
```

By default, the following URLs are available:

- Web UI: `http://localhost:5968/`
- File listing API: `http://localhost:5968/api/files`
- Upload API: `http://localhost:5968/api/upload/<file-name>`
- Download API: `http://localhost:5968/api/files/<file-name>`
- Health check: `http://localhost:5968/health`

When `--base-url` is specified, the UI-generated download URLs and API command examples use that URL as their base.

`--config-file` points to the configuration file and is useful when you want more detailed customization.
The file is optional. If the default behavior works for you, you do not need it.

### Authentication

`uplodah` supports optional authentication.
Use `--auth-mode publish` to protect uploads only, or `--auth-mode full` to require authentication for the whole server.
Initialize the first admin user with `uplodah --auth-init`, then generate API passwords from the Web UI for `curl` and other API clients.

---

## Documentation

[See the repository documentation](https://github.com/kekyo/uplodah).

## Pull Requests

Pull requests are welcome! Please submit them as diffs against the `develop` branch and squashed changes before send.

## License

Under MIT.
