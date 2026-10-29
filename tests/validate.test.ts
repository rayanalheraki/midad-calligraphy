import { describe, expect, it } from 'vitest';
import { createDoc, createImage, createMark, createText } from '../src/model/defaults';
import { TEMPLATES } from '../src/model/templates';
import { withAttached } from '../src/store/editor';
import { validateDoc } from '../src/model/validate';

describe('project validation', () => {
  it('accepts a valid document and keeps its content', () => {
    const doc = createDoc('اختبار');
    doc.pages[0].objects.push(createText({ text: 'السلام عليكم', size: 30 }));
    const { doc: out, warnings } = validateDoc(JSON.parse(JSON.stringify(doc)));
    expect(warnings).toEqual([]);
    expect(out.pages[0].objects[0]).toMatchObject({ type: 'text', text: 'السلام عليكم', size: 30 });
  });

  it('drops images whose source is not an embedded raster image', () => {
    const doc = createDoc();
    doc.pages[0].objects.push(createImage('javascript:alert(1)', 10, 10));
    doc.pages[0].objects.push(createImage('https://example.com/x.png', 10, 10));
    doc.pages[0].objects.push(createImage('data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Lz48L3N2Zz4=', 10, 10));
    doc.pages[0].objects.push(createImage('data:image/png;base64,iVBORw0KGgo=', 10, 10));
    const { doc: out } = validateDoc(JSON.parse(JSON.stringify(doc)));
    expect(out.pages[0].objects).toHaveLength(1);
  });

  it('clamps numbers, sanitises colours and ignores unknown fields', () => {
    const raw = {
      format: 'midad',
      version: 1,
      title: 'x',
      pages: [
        {
          width: 1e12,
          height: -5,
          objects: [{ type: 'text', text: 'نص', size: Infinity, fill: { kind: 'solid', color: 'red;background:url(x)' }, onclick: 'evil()' }],
        },
      ],
    };
    const { doc } = validateDoc(raw);
    const p = doc.pages[0];
    expect(p.width).toBe(5000);
    expect(p.height).toBe(10);
    const t = p.objects[0] as unknown as Record<string, unknown>;
    expect(t.size).toBe(18);
    expect(t.fill).toEqual({ kind: 'solid', color: '#1b1e27' });
    expect('onclick' in t).toBe(false);
  });

  it('replaces unknown fonts with the default font', () => {
    const doc = createDoc();
    doc.pages[0].objects.push(createText({ fontId: 'does-not-exist' }));
    const { doc: out, warnings } = validateDoc(JSON.parse(JSON.stringify(doc)));
    expect((out.pages[0].objects[0] as { fontId: string }).fontId).toBe('amiri');
    expect(warnings.length).toBe(1);
  });

  it('rejects non-project JSON', () => {
    expect(() => validateDoc({ hello: 1 })).toThrow();
  });
});

describe('standalone elements in projects', () => {
  it('keeps the link between an element and its line after ids are regenerated', () => {
    const doc = createDoc();
    const line = createText({ text: 'محمد' });
    const mark = createMark({ element: 'fatha', shape: 'glyph', text: 'َ', ownerId: line.id });
    const loose = createMark({ element: 'dot1', shape: 'dot1', text: '', ownerId: 'missing' });
    doc.pages[0].objects.push(line, mark, loose);
    const { doc: out } = validateDoc(JSON.parse(JSON.stringify(doc)));
    const [l, m, d] = out.pages[0].objects as unknown as [{ id: string }, { ownerId: string | null }, { ownerId: string | null }];
    expect(m.ownerId).toBe(l.id);
    expect(d.ownerId).toBeNull();
  });

  it('takes the drawn text from the catalogue, not from the file', () => {
    const raw = JSON.parse(JSON.stringify(createDoc()));
    raw.pages[0].objects.push({ type: 'mark', element: 'fatha', shape: 'glyph', text: 'a very long injected string', size: 10 });
    const { doc } = validateDoc(raw);
    expect((doc.pages[0].objects[0] as { text: string }).text).toBe('َ');
  });

  it('every template is a valid document', () => {
    for (const t of TEMPLATES) {
      const doc = createDoc(t.name);
      doc.pages = [t.build()];
      const { warnings } = validateDoc(JSON.parse(JSON.stringify(doc)));
      expect(warnings, t.id).toEqual([]);
    }
    expect(TEMPLATES[0].id).toBe('seal');
  });
});

describe('element attachment', () => {
  it('collects the elements attached to selected lines', () => {
    const line = createText();
    const m1 = createMark({ element: 'fatha', shape: 'glyph', text: 'َ', ownerId: line.id });
    const m2 = createMark({ element: 'dot1', shape: 'dot1', text: '' });
    expect(withAttached([line, m1, m2], [line.id]).sort()).toEqual([line.id, m1.id].sort());
  });
});
