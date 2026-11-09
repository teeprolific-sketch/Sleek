import crypto from 'node:crypto';

/**
 * Media storage. Production: private bucket (S3/GCS/R2) with short-lived signed
 * PUT URLs; objects are encrypted at rest and only served via signed GETs.
 */
export interface StorageProvider {
  signUpload(i: { key: string; contentType: string }): Promise<{ uploadUrl: string; objectUri: string; expiresInSec: number }>;
}

export class MockStorage implements StorageProvider {
  constructor(private baseUrl: string) {}
  async signUpload(i: { key: string; contentType: string }) {
    const sig = crypto.randomBytes(8).toString('hex');
    return { uploadUrl: `${this.baseUrl}/v1/dev/uploads/${i.key}?sig=${sig}`, objectUri: `sleek-media://${i.key}`, expiresInSec: 600 };
  }
}
