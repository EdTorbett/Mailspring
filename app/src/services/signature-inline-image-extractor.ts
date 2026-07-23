import fs from 'fs';
import path from 'path';
import { localized } from '../intl';
import { Message } from '../flux/models/message';
import { File } from '../flux/models/file';
import * as Utils from '../flux/models/utils';
import AttachmentStore from '../flux/stores/attachment-store';

const MAX_ATTACHMENT_BYTES = 25 * 1000000;

const IMAGE_EXTENSIONS = {
  'image/apng': 'apng',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/tiff': 'tiff',
  'image/webp': 'webp',
};

function parseImageDataURI(src: string) {
  const match = src.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    return null;
  }

  const mimeType = match[1].toLowerCase();
  const payload = match[2].replace(/\s/g, '');
  const extension = IMAGE_EXTENSIONS[mimeType] || mimeType.split('/').pop().split('+')[0];

  if (!extension || payload.length === 0 || payload.length % 4 !== 0) {
    return null;
  }

  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length === 0) {
    return null;
  }

  return { buffer, extension, mimeType };
}

function fileForImageData({
  index,
  buffer,
  extension,
  mimeType,
}: {
  index: number;
  buffer: Buffer;
  extension: string;
  mimeType: string;
}) {
  const file = new File({
    id: Utils.generateTempId(),
    filename: `Signature Image ${index}.${extension}`,
    size: buffer.length,
    contentType: mimeType,
    messageId: null,
    contentId: Utils.generateContentId(),
  });

  const destinationPath = AttachmentStore.pathForFile(file);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, buffer);
  return file;
}

export function extractSignatureInlineImages(draft: Message) {
  if (draft.plaintext || !draft.body || !draft.body.includes('<signature')) {
    return;
  }

  const draftBodyRootNode = document.createElement('root');
  draftBodyRootNode.innerHTML = draft.body;

  const files = [...(draft.files || [])];
  let totalAttachmentBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
  let signatureImageIndex = 1;
  let changed = false;

  for (const img of Array.from(draftBodyRootNode.querySelectorAll('signature img'))) {
    const src = img.getAttribute('src') || '';
    if (!/^data:image/i.test(src)) {
      continue;
    }

    const parsed = parseImageDataURI(src);
    if (!parsed) {
      continue;
    }

    if (parsed.buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        localized(
          `%@ cannot be attached because it is larger than 25MB.`,
          `Signature Image ${signatureImageIndex}.${parsed.extension}`
        )
      );
    }
    if (totalAttachmentBytes + parsed.buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(localized(`Sorry, you can't attach more than 25MB of attachments`));
    }

    const file = fileForImageData({
      index: signatureImageIndex,
      buffer: parsed.buffer,
      extension: parsed.extension,
      mimeType: parsed.mimeType,
    });

    files.push(file);
    totalAttachmentBytes += parsed.buffer.length;
    signatureImageIndex += 1;
    img.setAttribute('src', `cid:${file.contentId}`);
    changed = true;
  }

  if (changed) {
    draft.files = files;
    draft.body = draftBodyRootNode.innerHTML;
  }
}
