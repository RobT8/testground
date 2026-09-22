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

function pngFilename(holidayName: string): string {
  const slug = holidayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `kidrota-${slug || 'plan'}.png`;
}

/**
 * Turn part of the screen into a PNG and hand it to the share sheet.
 *
 * Rendered at twice the screen scale, because the grid's carer labels are 10px
 * and a 1x capture of them is unreadable once WhatsApp has compressed it.
 */
export async function shareElementAsImage(
  element: HTMLElement,
  holidayName: string,
): Promise<SaveResult> {
  const { toPng } = await import('html-to-image');
  const filename = pngFilename(holidayName);

  const dataUrl = await toPng(element, {
    pixelRatio: 2,
    // The capture has no page behind it, so it needs its own background.
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    // A horizontally scrolled grid should share the whole week, not the
    // portion that happens to be on screen.
    width: element.scrollWidth,
    style: { overflow: 'visible' },
  });

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');

    const written = await Filesystem.writeFile({
      path: filename,
      // writeFile wants base64 without the data-URL prefix.
      data: dataUrl.split(',')[1],
      directory: Directory.Cache,
    });

    await Share.share({
      title: holidayName,
      text: `${holidayName} — who has the kids`,
      url: written.uri,
      dialogTitle: 'Share this week',
    });

    return { filename, shared: true };
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  return { filename, shared: false };
}

/** Share a plan code as plain text, or copy it when there is no share sheet. */
export async function sharePlanCode(code: string, holidayName: string): Promise<'shared' | 'copied'> {
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import('@capacitor/share');
    await Share.share({
      title: holidayName,
      text: `${holidayName} — open this in KidRota to load the plan:\n\n${code}`,
      dialogTitle: 'Send the plan',
    });
    return 'shared';
  }

  await navigator.clipboard.writeText(code);
  return 'copied';
}
