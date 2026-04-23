# uplodah

Simple and modern universal file upload/download server.

![uplodah](./images/uplodah-120.png)

[![Project Status: Active – The project has reached a stable, usable state and is being actively developed.](https://www.repostatus.org/badges/latest/active.svg)](https://www.repostatus.org/#active)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/uplodah.svg)](https://www.npmjs.com/package/uplodah)
[![Docker Image Version](https://img.shields.io/docker/v/kekyo/uplodah.svg?label=docker)](https://hub.docker.com/r/kekyo/uplodah)

---

[(For Japanese language/日本語はこちら)](./README_ja.md)

> Please note that this English version of the document was machine-translated and then partially edited, so it may contain inaccuracies.
> We welcome pull requests to correct any errors in the text.

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
  - Per-directory store/delete control
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

### Web UI

The Web UI is user-friendly and includes file browsing per directory, file filtering, upload support, and ready-to-copy `curl` usage examples:

![File list](./images/filelist.png)

The UI also shows upload and download examples using `curl`, which makes CLI integration straightforward:

![cURL example](./images/curl-example.png)

### Uploading Files

You can upload files from the UI.
It supports drag and drop and makes uploading multiple files at the same time very easy:

![Upload](./images/upload.png)

You can also upload files through the API.
The following example uploads `report.txt` into the root directory with `curl`:

```bash
curl -X POST http://localhost:5968/api/upload/report.txt \
  -H "Content-Type: application/octet-stream" \
  --data-binary @./report.txt
```

You can do the same with `PUT`:

```bash
curl -X PUT http://localhost:5968/api/upload/report.txt \
  -H "Content-Type: application/octet-stream" \
  --data-binary @./report.txt
```

When the upload succeeds, the server returns `201 Created`.
The response body includes the stored `uploadId` and generated download URLs.
The `Location` header is also set to the download target.

TODO: Add a JSON response example.

### Uploading into Virtual Directories

If `storage` rules are configured, you can upload files into virtual subdirectories.
In the UI, the target directory is selected from the dropdown in the upload panel.

When using the API, include the subdirectory path in the request URL.
The following example stores `report.txt` under `/foobar`:

```bash
curl -X POST http://localhost:5968/api/upload/foobar/report.txt \
  -H "Content-Type: application/octet-stream" \
  --data-binary @./report.txt
```

This API path is treated as the public file name `/foobar/report.txt`.

Notes:

- If `storage` is not configured, only plain file names such as `report.txt` are allowed.
- If `storage` is configured, uploadable directories are limited to paths defined there.
- Paths containing special characters should be encoded per URL segment.

### Downloading Files

To download a file from the UI, open the entry from the file list and click the "Download" button for the desired version.
As described earlier, `uplodah` can store multiple versions of the same file.
Those versions are distinguished by upload timestamp, and the list is shown from newest to oldest:

![Download](./images/download.png)

When using `curl`, you also need to specify which version to download.
The precise value is returned in the JSON response from the upload API, but if you know the timestamp-based ID, you can construct the URL directly.

Download the latest version by file name only:

```bash
curl -L "http://localhost:5968/api/files/report.txt" -o ./report.txt
```

Download a specific version in `YYYYMMDD_HHmmss_fff` format:

```bash
curl -L "http://localhost:5968/api/files/report.txt/20260406_203040_123" -o ./report.txt
```

Note that if multiple uploads happen at exactly the same timestamp, the version identifier may gain a suffix such as `_1`, `_2`, and so on.

When selecting multiple versions in the Web UI and downloading them as a batch, the server creates the ZIP archive as a background job and stores it in a temporary file until it is downloaded or expires. The ZIP file name uses the `{realm}_YYYYMMDD_HHmmss.zip` form, where the timestamp is generated by the browser in its local timezone. The temporary server-side file name does not reuse the browser-provided file name.

### File Listing

To fetch the file list with `curl`:

```bash
curl "http://localhost:5968/api/files?skip=0&take=20"
```

The listing API returns groups sorted by most recent upload first.
Each group contains all versions for that file name.

---

## File Storage Configuration

### Storage Location

By default, uploaded files are stored under `./storage`.
You can change this with the `--storage-dir` option or the `storageDir` setting:

```bash
# Use the default ./storage directory
uplodah

# Use a custom directory
uplodah --storage-dir /srv/uplodah/storage
```

Relative paths provided via CLI options or environment variables are resolved from the current working directory.
`storageDir` inside `config.json` is resolved relative to the directory containing that `config.json`.

### Storage Layout

As described above, `uplodah` does not use any special database.
It only places directories and files under the storage directory.

Each stored upload is recognized only when all of the following are true:

- The version directory name can be parsed as an `uploadId`
- `metadata.json` exists and contains valid JSON
- A payload file exists in the same directory and its file name matches the parent file-group directory name

The storage tree mirrors the public path directly under the storage root:

```text
storage/
├── report.txt/
│   └── 20260406_203040_123/
│       ├── metadata.json
│       └── report.txt
└── bropdox/
    └── report.txt/
        └── 20260406_204512_918/
            ├── metadata.json
            └── report.txt
```

When `storage` rules are enabled, the directory segments from the public path are simply inserted before the file-group directory.
No separate internal tree is used.

`uploadId` values are generated from timestamps in `YYYYMMDD_HHmmss_fff` format.
If multiple uploads collide within the same millisecond, a sequence suffix is appended.

### Virtual Directory Rules

You can define rules for virtual directories in `config.json`.
The `storage` section is optional.
If it is not defined, uploads are accepted only at the root with plain file names.

Once `storage: { ... }` is defined, uploads must target a path under a configured virtual directory.
When uploading into deeper subdirectories, the most specific matching virtual directory rule is applied.
You can also configure behavior per virtual directory.

Here is an example `storage` section in `config.json`:

```json
{
  "port": 5968,
  "storage": {
    // Enabled virtual directories
    "/": {}, // (Root directory)
    "/bropdox": {
      // "/bropdox"
      "description": "Temporary sharing area",
      "accept": ["store", "delete"],
      "expireSeconds": 86400 // Expire after 24 hours
    },
    "/archive": {
      // "/archive"
      "description": "Long-term archive",
      "accept": [] // Read only
    },
    "/archive/incoming": {
      "accept": ["store", "delete"]
    } // "/archive/incoming"
  }
}
```

In this example:

- `/` accepts normal uploads
- Uploads anywhere under `/bropdox` expire automatically after 24 hours
- `/archive` accepts deletion but not uploads
- `/archive/incoming` is more specific than `/archive`, so uploads are allowed there again under that subtree

Rule behavior:

- Keys must always start with `/`
- Backslashes and relative path segments such as `.` and `..` are not allowed
- `description` is shown in the UI directory list and upload-directory selector
- `accept` may contain `store` and/or `delete`; when omitted, both remain allowed for backward compatibility
- The most specific matching directory rule is applied
- Once `storage` is defined, uploads outside configured virtual directory subtrees are rejected
  To allow uploads at the root directory and its descendants as well, include `/` explicitly as shown above

### Backup and Restore

Because there is no database, backing up the storage directory is sufficient:

```bash
cd /your/server/base/dir
tar -cf - ./storage | bzip2 -9 > backup-storage.tar.bz2
```

To restore, extract the archive and start `uplodah` again with the same `storageDir` setting.

If the directory structure is damaged, you can rebuild it manually as long as you preserve the required layout:

1. Create a directory in the form `<public-path>/<YYYYMMDD_HHmmss_fff[_num]>/`.
2. Place a valid JSON `metadata.json` into that directory.
3. Place the payload file into the same directory, and name it exactly the same as the parent file-group directory.

If you modify the storage directory directly while `uplodah` is running, those changes are not reflected immediately.
Restart `uplodah` afterward.

---

## Configuration

`uplodah` supports configuration via command-line options, environment variables, and `config.json`.

Settings are applied in the following order, from highest priority to lowest:

1. Command-line options
2. Environment variables
3. `config.json`
4. Default values

## Configuration File Structure

You can specify a custom configuration file:

```bash
# Using a command-line option
uplodah --config-file /path/to/config.json

# Using an environment variable
export UPLODAH_CONFIG_FILE=/path/to/config.json
uplodah
```

If not specified, `uplodah` looks for `./config.json` in the current directory.

`config.json` is parsed as JSON5, so comments and trailing commas are allowed.

### `config.json` Structure

```json
{
  "port": 5968,
  "baseUrl": "https://files.example.com/uplodah",
  "storageDir": "./storage",
  "usersFile": "./users.json",
  "realm": "Awesome uplodah",
  "logLevel": "info",
  "trustedProxies": ["127.0.0.1", "::1"],
  "authMode": "none",
  "sessionSecret": "<your-secret-here>",
  "passwordMinScore": 2,
  "passwordStrengthCheck": true,
  "maxUploadSizeMb": 500,
  "maxDownloadSizeMb": 500,
  "storage": {
    "/": {
      "accept": ["store"]
    },
    "/bropdox": {
      "accept": ["store", "delete"],
      "expireSeconds": 86400
    },
    "/archive": {
      "accept": ["delete"]
    }
  }
}
```

All fields are optional.
Only specify the ones you want to override.

Relative `storageDir` and `usersFile` paths are resolved from the directory containing `config.json`.

---

## Authentication

`uplodah` also supports authentication.

| Authentication Mode | Details                                                                               | Auth Initialization |
| :------------------ | :------------------------------------------------------------------------------------ | :------------------ |
| `none`              | Default. No authentication required                                                   | Not required        |
| `publish`           | Authentication required for uploads and admin UI. Listing and downloads remain public | Required            |
| `full`              | Authentication required for all operations (must login first)                         | Required            |

To enable authentication on `uplodah`, first register an initial user using the `--auth-init` option.

### Initialize

Create an initial admin user interactively:

```bash
uplodah --auth-init
```

This command will:

1. Prompt for admin username
2. Prompt for password (with strength checking, masked input)
3. Create `users.json`
4. Exit after initialization (server does not start)

When enabling authentication with the Docker image, run this option against the same mounted config/data directory so that `users.json` is created in persistent storage.

### Example session

```
Initializing authentication...
Enter admin username: admin
Enter password: ********
Password strength: Good
Confirm password: ********
Creating admin user...

============================================================
Admin user created successfully!
============================================================
Username: admin
Role: admin
============================================================

Note: You need to generate an API password for API access.
You can do this through the web UI after logging in with your username and password.
============================================================
```

### User Management

Users added with `--auth-init` automatically become administrator users.
Administrator users can add or remove other users through the UI, and can reset user passwords.

Available roles are:

- `read`: browse, list, and download files
- `publish`: same as `read`, plus upload files
- `admin`: same as `publish`, plus user management

Administrator users can also generate API passwords, but it is usually better to separate day-to-day upload accounts from the admin account.

### Using API passwords

`uplodah` distinguishes between the password used to log in to the UI and the password used by API clients.
API clients use an "API password" with HTTP Basic authentication.

Log in through the browser UI first, then open the API password screen from the user menu and create one or more labeled API passwords.
The plaintext API password is shown only once, so store it securely.

Examples:

```bash
# Upload with API password
curl -X POST http://localhost:5968/api/upload/report.txt \
  -u publisher:xxxxxxxxxxxxxxxxxxxxxx \
  -H "Content-Type: application/octet-stream" \
  --data-binary @./report.txt
```

```bash
# List files with API password (required in authMode=full)
curl "http://localhost:5968/api/files?skip=0&take=20" \
  -u reader:xxxxxxxxxxxxxxxxxxxxxx
```

```bash
# Download the latest file version with API password (required in authMode=full)
curl -L "http://localhost:5968/api/files/report.txt" \
  -u reader:xxxxxxxxxxxxxxxxxxxxxx \
  -o ./report.txt
```

In `publish` mode, HTTP Basic authentication is required only for upload APIs.
In `full` mode, provide Basic authentication for all API routes, while the browser UI uses the session created after login.

### Password strength requirements

`uplodah` uses the `zxcvbn` library to enforce strong password requirements:

- Evaluates password strength on a scale of 0-4 (Weak to Very Strong)
- Default minimum score: 2 (Good)
- Checks against common passwords, dictionary words, and patterns
- Provides feedback during password creation

Configure password requirements in `config.json`:

```json
{
  "passwordMinScore": 2, // 0-4, default: 2 (Good)
  "passwordStrengthCheck": true // default: true
}
```

`uplodah` stores both login passwords and API passwords as salted hashes, so plaintext passwords are not saved on disk.
However, if you do not use HTTPS (TLS), the `Authorization` header contains the plaintext API password, which makes it vulnerable to sniffing.
If the server is exposed beyond a trusted local network, protect communications with HTTPS.

---

## Reverse Proxy Interoperability

The server is designed to run behind a reverse proxy.
For example, you may want to expose it at `https://files.example.com/uplodah` while the Node.js server itself runs on another host or port internally.

### URL Resolution

The server resolves its public URL with the following priority:

1. Fixed base URL: `--base-url` or `baseUrl`
2. `Forwarded` header
3. `X-Forwarded-Proto`, `X-Forwarded-Host`, and `X-Forwarded-Port`
4. Normal `Host` header

For subpath hosting, the path prefix can be resolved in one of these ways:

- Include the path in `baseUrl`
- Send the `X-Forwarded-Path` header

The most reliable option is to fix `baseUrl` explicitly:

```bash
uplodah --base-url https://files.example.com/uplodah
```

In that case, the public URLs look like this:

- Web UI: `https://files.example.com/uplodah/`
- File listing API: `https://files.example.com/uplodah/api/files`
- Download API: `https://files.example.com/uplodah/api/files/report.txt`

If you want to explicitly define trusted proxies, configure `trustedProxies`:

```bash
uplodah --trusted-proxies "10.0.0.10,10.0.0.11"
```

You can provide the same values via environment variables:

```bash
export UPLODAH_BASE_URL=https://files.example.com/uplodah
export UPLODAH_TRUSTED_PROXIES=10.0.0.10,10.0.0.11
export UPLODAH_CONFIG_FILE=/srv/uplodah/config.json
export UPLODAH_STORAGE_DIR=/srv/uplodah/storage
export UPLODAH_MAX_UPLOAD_SIZE_MB=500
```

---

## Docker usage

Docker images are available for multiple architectures:

- `linux/amd64` (x86_64)
- `linux/arm64` (aarch64)

When pulling the image, Docker automatically selects the appropriate architecture for your platform.

### Quick start

Suppose you have configured the following directory structure for persistence (recommended):

```
docker-instance/
├── data/
│   └── config.json
└── storage/
    └── (uploaded files)
```

Execute as follows:

```bash
# Pull and run the latest version
docker run -d -p 5968:5968 \
  -v $(pwd)/data:/data \
  -v $(pwd)/storage:/storage \
  kekyo/uplodah:latest

# Or with Docker Compose
cat > docker-compose.yml << EOF
version: '3'
services:
  uplodah:
    image: kekyo/uplodah:latest
    ports:
      - "5968:5968"
    volumes:
      - ./data:/data
      - ./storage:/storage
    environment:
      - UPLODAH_BASE_URL=http://localhost:5968
EOF

docker-compose up -d
```

`uplodah` is now available at:

- Web UI: `http://localhost:5968/`
- File listing API: `http://localhost:5968/api/files`
- Upload API: `http://localhost:5968/api/upload/<file-name>`
- Download API: `http://localhost:5968/api/files/<file-name>`
- Health check: `http://localhost:5968/health`

### Permission requirements

The Docker container runs as the `uplodah` user (UID 1001) for security reasons.
You need to ensure that the mounted directories have the appropriate permissions for this user to read and write files.

**Set proper permissions for mounted directories:**

```bash
# Create directories if they don't exist
mkdir -p ./data ./storage

# Set ownership to UID 1001 (matches the container's uplodah user)
sudo chown -R 1001:1001 ./data ./storage
```

**Important**: Without proper permissions, you may encounter `Permission denied` errors when:

- Creating directories for uploads
- Writing uploaded files into `/storage`
- Deleting expired files from `/storage`
- Reading `/data/config.json`

### Basic usage

```bash
# Run with default settings (port 5968, storage and config taken from mounted volumes)
docker run -p 5968:5968 \
  -v $(pwd)/data:/data \
  -v $(pwd)/storage:/storage \
  kekyo/uplodah:latest

# With a fixed public base URL
docker run -p 5968:5968 \
  -v $(pwd)/data:/data \
  -v $(pwd)/storage:/storage \
  -e UPLODAH_BASE_URL=https://files.example.com/uplodah \
  kekyo/uplodah:latest
```

You can also change settings using environment variables or command-line options, but the easiest way to configure settings is to use `config.json`.

Since the Docker image has mount points configured, you can mount `/data` and `/storage` as shown in the example above and place `/data/config.json` there to flexibly configure settings.
Below is an example of `config.json`:

```json
{
  "port": 5968,
  "baseUrl": "http://localhost:5968",
  "realm": "Awesome uplodah",
  "logLevel": "info",
  "maxUploadSizeMb": 500,
  "maxDownloadSizeMb": 500,
  "storage": {
    "/": {
      "accept": ["store"]
    },
    "/bropdox": {
      "accept": ["store", "delete"],
      "expireSeconds": 86400
    },
    "/archive": {
      "accept": ["delete"]
    }
  }
}
```

Note: The default container command already specifies `--config-file /data/config.json --storage-dir /storage`.
If you need a different storage directory or config file path, override the container command explicitly.

### Volume mounts and configuration

- `/data`: Default location for `config.json` and other runtime files you want to place beside it
- `/storage`: Default upload storage directory

**Default behavior**: The Docker image runs with `--config-file /data/config.json --storage-dir /storage` by default.

**Configuration priority** (highest to lowest):

1. Custom command line arguments (when overriding CMD)
2. Environment variables for settings not already fixed by the command line, such as `UPLODAH_BASE_URL`
3. `config.json` values loaded from `/data/config.json`
4. Built-in default values in `uplodah`

### Example of Automatic Startup Using systemd

Various methods exist for automatically starting containers with systemd.
Below is a simple example of configuring a systemd service using Podman.
This is a simple service unit file used before quadlets were introduced to Podman.
By placing this file and having systemd recognize it, you can automatically start `uplodah`:

`/etc/systemd/system/container-uplodah.service`:

```ini
# container-uplodah.service

[Unit]
Description=Podman container-uplodah.service
Documentation=man:podman-generate-systemd(1)
Wants=network-online.target
After=network-online.target
RequiresMountsFor=%t/containers

[Service]
Environment=PODMAN_SYSTEMD_UNIT=%n
Restart=always
RestartSec=30
TimeoutStopSec=70
ExecStart=/usr/bin/podman run \
        --cidfile=%t/%n.ctr-id \
        --cgroups=no-conmon \
        --rm \
        --sdnotify=conmon \
        --replace \
        -d \
        -p 5968:5968 \
        --name uplodah \
        -v /export/data:/data -v /export/storage:/storage docker.io/kekyo/uplodah:latest
ExecStop=/usr/bin/podman stop \
        --ignore -t 10 \
        --cidfile=%t/%n.ctr-id
ExecStopPost=/usr/bin/podman rm \
        -f \
        --ignore -t 10 \
        --cidfile=%t/%n.ctr-id
Type=notify
NotifyAccess=all

[Install]
WantedBy=default.target
```

---

## Building the Docker image (Advanced)

The build of the `uplodah` Docker image uses Podman.

### Multi-platform build with Podman (recommended)

Use the provided multi-platform build script that uses Podman to build for all supported architectures:

```bash
# Build for all platforms (local only, no push)
./build-docker-multiplatform.sh

# Build and push to Docker Hub
./build-docker-multiplatform.sh --push

# Build for specific platforms only
./build-docker-multiplatform.sh --platforms linux/amd64,linux/arm64

# Push with custom Docker Hub username
OCI_SERVER_USER=yourusername ./build-docker-multiplatform.sh --push

# Inspect existing manifest
./build-docker-multiplatform.sh --inspect
```

**Important**: For cross-platform builds, QEMU emulation must be configured first:

```bash
# Option 1: Use QEMU container (recommended)
sudo podman run --rm --privileged docker.io/multiarch/qemu-user-static --reset -p yes

# Option 2: Install system packages
# Ubuntu/Debian:
sudo apt-get update && sudo apt-get install -y qemu-user-static
# Fedora/RHEL:
sudo dnf install -y qemu-user-static

# Verify QEMU is working:
podman run --rm --platform linux/arm64 alpine:latest uname -m
# Should output: aarch64
```

Without QEMU, you can only build for your native architecture.

---

## Notes

### Health Check

`/health` returns a response like this:

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

### Configuration Reference Table

All settings are resolved with the priority **CLI > environment variable > config.json > default**.

| CLI option                      | Environment variable                 | `config.json` key       | Description                                              | Valid values                               | Default             |
| :------------------------------ | :----------------------------------- | :---------------------- | :------------------------------------------------------- | :----------------------------------------- | :------------------ |
| `-p, --port <port>`             | `UPLODAH_PORT`                       | `port`                  | HTTP server listening port                               | 1-65535                                    | `5968`              |
| `-b, --base-url <url>`          | `UPLODAH_BASE_URL`                   | `baseUrl`               | Fixed external base URL                                  | valid URL                                  | auto-detected       |
| `-d, --storage-dir <dir>`       | `UPLODAH_STORAGE_DIR`                | `storageDir`            | Storage root directory                                   | valid path                                 | `./storage`         |
| `-c, --config-file <path>`      | `UPLODAH_CONFIG_FILE`                | N/A                     | Path to the configuration file                           | valid path                                 | `./config.json`     |
| `-u, --users-file <path>`       | `UPLODAH_USERS_FILE`                 | `usersFile`             | Path to the users database file                          | valid path                                 | `./users.json`      |
| `-r, --realm <realm>`           | `UPLODAH_REALM`                      | `realm`                 | UI title and server label                                | string                                     | `uplodah [version]` |
| `-l, --log-level <level>`       | `UPLODAH_LOG_LEVEL`                  | `logLevel`              | Log verbosity                                            | `debug`, `info`, `warn`, `error`, `ignore` | `info`              |
| `--trusted-proxies <ips>`       | `UPLODAH_TRUSTED_PROXIES`            | `trustedProxies`        | Comma-separated trusted proxy IP list                    | list of IP addresses                       | none                |
| `--auth-mode <mode>`            | `UPLODAH_AUTH_MODE`                  | `authMode`              | Authentication mode                                      | `none`, `publish`, `full`                  | `none`              |
| N/A                             | `UPLODAH_SESSION_SECRET`             | `sessionSecret`         | Secret used for session cookies                          | string                                     | auto-generated      |
| N/A                             | `UPLODAH_PASSWORD_MIN_SCORE`         | `passwordMinScore`      | Minimum password strength score                          | 0-4                                        | `2`                 |
| N/A                             | `UPLODAH_PASSWORD_STRENGTH_CHECK`    | `passwordStrengthCheck` | Enable password strength checking                        | `true`, `false`                            | `true`              |
| `--max-upload-size-mb <size>`   | `UPLODAH_MAX_UPLOAD_SIZE_MB`         | `maxUploadSizeMb`       | Maximum upload size in MB                                | 1-10000                                    | `100`               |
| `--max-download-size-mb <size>` | `UPLODAH_MAX_DOWNLOAD_SIZE_MB`       | `maxDownloadSizeMb`     | Maximum selected batch download size in MB               | 1-10000                                    | `100`               |
| N/A                             | N/A                                  | `storage`               | Per-virtual-directory storage policy                     | object                                     | unset               |
| N/A                             | `UPLODAH_AUTH_FAILURE_DELAY_ENABLED` | N/A                     | Enable progressive delays for failed auth attempts       | `true`, `false`                            | `true`              |
| N/A                             | `UPLODAH_AUTH_FAILURE_MAX_DELAY`     | N/A                     | Maximum delay for failed auth attempts (ms)              | number                                     | `10000`             |
| `--auth-init`                   | N/A                                  | N/A                     | Initialize authentication with an interactive admin user | flag                                       | N/A                 |

## Other

This server project is a sister project of [nuget-server](https://github.com/kekyo/nuget-server/).

## License

Under MIT.
