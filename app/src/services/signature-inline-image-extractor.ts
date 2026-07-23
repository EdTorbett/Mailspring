import fs from 'fs';
import path from 'path';
import { localized } from '../intl';
import { Message } from '../flux/models/message';
import { File } from '../flux/models/file';
import * as Utils from '../flux/models/utils';
import AttachmentStore from '../flux/stores/attachment-store';

const MAX_ATTACHMENT_BYTES = 25 * 1000000;

function parseImageDataURI(src: string) {
  const match = src.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    return null;
  }

  const mimeType = match[1].toLowerCase();
  const payload = match[2].replace(/\s/g, '');

  if (payload.length === 0 || payload.length % 4 !== 0) {
    return null;
  }

  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length === 0) {
    return null;
  }

  return { buffer, mimeType };
}

function fileForImageData({
  index,
  buffer,
  mimeType,
}: {
  index: number;
  buffer: Buffer;
  mimeType: string;
}) {
  const file = new File({
    id: Utils.generateTempId(),
    filename: `Signature Image ${index}`,
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
          `Signature Image ${signatureImageIndex}`
        )
      );
    }
    if (totalAttachmentBytes + parsed.buffer.length > MAX_ATTACHMENT_BYTES) {
      throw new Error(localized(`Sorry, you can't attach more than 25MB of attachments`));
    }

    const file = fileForImageData({
      index: signatureImageIndex,
      buffer: parsed.buffer,
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
