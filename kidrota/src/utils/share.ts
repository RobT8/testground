import { Capacitor } from '@capacitor/core';
import type { BackupFile } from '../db/backup';

export interface SaveResult {
  filename: string;
  /** True when the system share sheet was used rather than a direct download. */
  shared: boolean;
}

function backupFilename(): string {
  const today = new Date();
  const stamp = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  return `kidrota-backup-${stamp}.json`;
}

/**
 * Save a backup off the device.
 *
 * On Android the file is written to app storage and handed to the system share
 * sheet, so the user can put it in Drive, Files or an email. Writing straight
 * to the public Downloads folder would need storage permissions the app
 * otherwise never asks for, for no extra benefit.
 *
 * In a browser it is an ordinary download.
 */
export async function downloadBackup(file: BackupFile): Promise<SaveResult> {
  const filename = backupFilename();
  const json = JSON.stringify(file, null, 2);

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    const written = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    await Share.share({
      title: 'KidRota backup',
      text: 'Your KidRota plan, as a backup file.',
      url: written.uri,
      dialogTitle: 'Save your backup',
    });

    return { filename, shared: true };
  }

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  return { filename, shared: false };
}
