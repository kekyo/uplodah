// uplodah - Simple and modern universal file upload/download server.
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/uplodah

import BusinessCenterIcon from '@mui/icons-material/Archive';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import CodeIcon from '@mui/icons-material/Code';
import SettingsIcon from '@mui/icons-material/Settings';
import CssIcon from '@mui/icons-material/Css';
import DataObjectIcon from '@mui/icons-material/DataObject';
import LibraryBooksIcon from '@mui/icons-material/LibraryBooks';
import FileIcon from '@mui/icons-material/InsertDriveFile';
import HtmlIcon from '@mui/icons-material/Html';
import ImageIcon from '@mui/icons-material/Image';
import JavascriptIcon from '@mui/icons-material/Javascript';
import MovieIcon from '@mui/icons-material/Movie';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import TableChartIcon from '@mui/icons-material/TableChart';
import TerminalIcon from '@mui/icons-material/Terminal';
import TextSnippetIcon from '@mui/icons-material/TextSnippet';

/**
 * Hard-coded representative MUI icons by lowercase file extension.
 * @remarks Representative examples include pdf, png, mp4, mp3, zip, csv,
 * json, html, css, tsx, sh, c, cpp, go, and py. Callers should fall back to
 * the default file icon when an extension is not present in this map.
 */
export const fileGroupIconsByExtension: Readonly<
  Record<string, typeof FileIcon>
> = {
  pdf: PictureAsPdfIcon,
  png: ImageIcon,
  jpg: ImageIcon,
  jpeg: ImageIcon,
  gif: ImageIcon,
  webp: ImageIcon,
  svg: ImageIcon,
  bmp: ImageIcon,
  tif: ImageIcon,
  tiff: ImageIcon,
  ico: ImageIcon,
  mp2: MovieIcon,
  mp4: MovieIcon,
  mpg: MovieIcon,
  mpeg: MovieIcon,
  mov: MovieIcon,
  avi: MovieIcon,
  mkv: MovieIcon,
  webm: MovieIcon,
  mp3: AudioFileIcon,
  wav: AudioFileIcon,
  ogg: AudioFileIcon,
  flac: AudioFileIcon,
  m4a: AudioFileIcon,
  aac: AudioFileIcon,
  ac3: AudioFileIcon,
  zip: BusinessCenterIcon,
  '7z': BusinessCenterIcon,
  tar: BusinessCenterIcon,
  gz: BusinessCenterIcon,
  tgz: BusinessCenterIcon,
  bz2: BusinessCenterIcon,
  xz: BusinessCenterIcon,
  lzma: BusinessCenterIcon,
  zstd: BusinessCenterIcon,
  lz4: BusinessCenterIcon,
  rar: BusinessCenterIcon,
  lzh: BusinessCenterIcon,
  Z: BusinessCenterIcon,
  arc: BusinessCenterIcon,
  txt: TextSnippetIcon,
  md: TextSnippetIcon,
  log: TextSnippetIcon,
  doc: LibraryBooksIcon,
  docx: LibraryBooksIcon,
  odt: LibraryBooksIcon,
  rtf: LibraryBooksIcon,
  csv: TableChartIcon,
  tsv: TableChartIcon,
  xls: TableChartIcon,
  xlsx: TableChartIcon,
  json: DataObjectIcon,
  jsonc: DataObjectIcon,
  json5: DataObjectIcon,
  jsonl: DataObjectIcon,
  yml: DataObjectIcon,
  yaml: DataObjectIcon,
  xml: DataObjectIcon,
  toml: DataObjectIcon,
  html: HtmlIcon,
  htm: HtmlIcon,
  sgml: HtmlIcon,
  css: CssIcon,
  scss: CssIcon,
  sass: CssIcon,
  less: CssIcon,
  js: JavascriptIcon,
  mjs: JavascriptIcon,
  cjs: JavascriptIcon,
  jsx: JavascriptIcon,
  ts: JavascriptIcon,
  tsx: JavascriptIcon,
  sh: TerminalIcon,
  bash: TerminalIcon,
  zsh: TerminalIcon,
  fish: TerminalIcon,
  c: CodeIcon,
  cc: CodeIcon,
  cpp: CodeIcon,
  'c++': CodeIcon,
  h: CodeIcon,
  hpp: CodeIcon,
  'h++': CodeIcon,
  java: CodeIcon,
  kt: CodeIcon,
  go: CodeIcon,
  rs: CodeIcon,
  py: CodeIcon,
  asm: CodeIcon,
  as: CodeIcon,
  s: CodeIcon,
  fc: CodeIcon,
  cs: CodeIcon,
  fs: CodeIcon,
  glsl: CodeIcon,
  v: CodeIcon,
  o: SettingsIcon,
  a: SettingsIcon,
  out: SettingsIcon,
  bin: SettingsIcon,
  so: SettingsIcon,
  ko: SettingsIcon,
  dll: SettingsIcon,
  sys: SettingsIcon,
  ax: SettingsIcon,
  dylib: SettingsIcon,
  exe: SettingsIcon,
  com: SettingsIcon,
  obj: SettingsIcon,
  lib: SettingsIcon,
  pdb: SettingsIcon,
  mdb: SettingsIcon,
};
