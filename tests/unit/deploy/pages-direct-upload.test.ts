import { describe, expect, it } from 'vitest';
import {
    pagesAssetHash,
    pagesContentType,
} from '@/lib/deploy/adapters/pages-direct-upload';

describe('pages direct upload helpers', () => {
    it('hashes like wrangler: blake3(base64 + extension).hex[:32]', () => {
        const bytes = Buffer.from('<!doctype html><html></html>', 'utf8');
        const hash = pagesAssetHash(bytes, 'index.html');
        expect(hash).toMatch(/^[0-9a-f]{32}$/);
        expect(hash).toBe(
            pagesAssetHash(Buffer.from(bytes), 'folder/index.html'),
        );
    });

    it('changes the hash when the extension changes', () => {
        const bytes = Buffer.from('body{}', 'utf8');
        expect(pagesAssetHash(bytes, 'a.css')).not.toBe(
            pagesAssetHash(bytes, 'a.js'),
        );
    });

    it('sets charset on text types', () => {
        expect(pagesContentType('index.html')).toContain('charset=utf-8');
        expect(pagesContentType('app.css')).toContain('text/css');
        expect(pagesContentType('photo.png')).toBe('image/png');
    });
});
