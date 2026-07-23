import fs from 'fs';
import AttachmentStore from '../../src/flux/stores/attachment-store';
import { Message } from '../../src/flux/models/message';
import { extractSignatureInlineImages } from '../../src/services/signature-inline-image-extractor';

const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII=';
const GIF_DATA_URI = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';

describe('extractSignatureInlineImages', function () {
  afterEach(function () {
    for (const file of this.draft?.files || []) {
      const filePath = AttachmentStore.pathForFile(file);
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  it('rewrites signature data images to cid attachments', function () {
    this.draft = new Message({
      draft: true,
      body: `<div>Hello</div><signature id="sig-1"><img src="${PNG_DATA_URI}"></signature>`,
      files: [],
    });

    extractSignatureInlineImages(this.draft);

    expect(this.draft.files.length).toBe(1);
    expect(this.draft.files[0].contentId).toBeTruthy();
    expect(this.draft.body).toContain(`src="cid:${this.draft.files[0].contentId}"`);
    expect(fs.existsSync(AttachmentStore.pathForFile(this.draft.files[0]))).toBe(true);
  });

  it('leaves existing cid images unchanged', function () {
    this.draft = new Message({
      draft: true,
      body: '<signature id="sig-1"><img src="cid:existing-content-id"></signature>',
      files: [],
    });

    extractSignatureInlineImages(this.draft);

    expect(this.draft.body).toBe(
      '<signature id="sig-1"><img src="cid:existing-content-id"></signature>'
    );
    expect(this.draft.files.length).toBe(0);
  });

  it('does not modify plaintext drafts', function () {
    this.draft = new Message({
      draft: true,
      plaintext: true,
      body: `<signature id="sig-1"><img src="${PNG_DATA_URI}"></signature>`,
      files: [],
    });

    extractSignatureInlineImages(this.draft);

    expect(this.draft.body).toBe(`<signature id="sig-1"><img src="${PNG_DATA_URI}"></signature>`);
    expect(this.draft.files.length).toBe(0);
  });

  it('creates distinct inline attachments for multiple signature images', function () {
    this.draft = new Message({
      draft: true,
      body: `<signature id="sig-1"><img src="${PNG_DATA_URI}"><img src="${GIF_DATA_URI}"></signature>`,
      files: [],
    });

    extractSignatureInlineImages(this.draft);

    expect(this.draft.files.length).toBe(2);
    expect(this.draft.files[0].contentId).not.toBe(this.draft.files[1].contentId);
    expect(this.draft.body).toContain(`src="cid:${this.draft.files[0].contentId}"`);
    expect(this.draft.body).toContain(`src="cid:${this.draft.files[1].contentId}"`);
  });

  it('only rewrites images inside signatures', function () {
    this.draft = new Message({
      draft: true,
      body: `<img src="${PNG_DATA_URI}"><signature id="sig-1"><img src="${GIF_DATA_URI}"></signature>`,
      files: [],
    });

    extractSignatureInlineImages(this.draft);

    expect(this.draft.files.length).toBe(1);
    expect(this.draft.body).toContain(`src="${PNG_DATA_URI}"`);
    expect(this.draft.body).toContain(`src="cid:${this.draft.files[0].contentId}"`);
  });
});
