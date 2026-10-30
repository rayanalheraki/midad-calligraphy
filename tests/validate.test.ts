import { describe, expect, it } from 'vitest';
import { createDoc, createMark, createText, defaultGlyphOverride } from '../src/model/defaults';
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

  it('keeps page backgrounds and drops image objects of older files', () => {
    const doc = createDoc();
    const raw = JSON.parse(JSON.stringify(doc));
    raw.pages[0].background = {
      color: '#FF0000',
      gradient: { from: '#000000', to: 'red', angle: 900 },
      pattern: { kind: 'stars8', size: 1, opacity: 5 },
      image: { src: 'data:image/png;base64,iVBORw0KGgo=', fit: 'contain', opacity: 0.5 },
    };
    raw.pages[0].objects.push({ type: 'image', src: 'data:image/png;base64,iVBORw0KGgo=', w: 10, h: 10 });
    raw.pages[0].objects.push(createText({ text: 'خط' }));
    const { doc: out, warnings } = validateDoc(raw);
    expect(out.pages[0].objects.map((o) => o.type)).toEqual(['text']);
    expect(out.pages[0].background).toEqual({
      color: '#ff0000',
      gradient: { from: '#000000', to: '#e9edf5', angle: 360 },
      pattern: { kind: 'stars8', color: '#1f3a73', size: 3, opacity: 1 },
      image: { src: 'data:image/png;base64,iVBORw0KGgo=', fit: 'contain', opacity: 0.5 },
    });
    expect(warnings.length).toBe(1);
  });

  it('drops unsafe background images and fills in a missing background', () => {
    const doc = createDoc();
    doc.pages.push(createDoc().pages[0]);
    const raw = JSON.parse(JSON.stringify(doc));
    raw.pages[0].background.image = { src: 'data:image/svg+xml;base64,PHN2Zz4=', fit: 'cover', opacity: 1 };
    delete raw.pages[1].background;
    const { doc: out, warnings } = validateDoc(raw);
    expect(out.pages[0].background.image).toBeNull();
    expect(out.pages[1].background).toEqual(createDoc().pages[0].background);
    expect(warnings.length).toBe(1);
  });

  it('keeps valid alternates, stretches and segment variants and drops malformed ones', () => {
    const t = createText({
      text: 'بسم الله',
      segVariants: { '0': ['ss01', '-liga', 'salt=2', 'bad feature', 'x@1:2'], '4': ['<script>'], abc: ['ss02'] },
      glyphs: {
        '0.0': { ...defaultGlyphOverride(), alt: 'uni0628.alt', stretch: 1.5, dip: 150 },
        '1.0': { ...defaultGlyphOverride(), alt: 'bad name with spaces', stretch: 99, dip: 9999 },
        '2.0': { ...defaultGlyphOverride(), stretch: 1 },
      },
    });
    const doc = createDoc();
    doc.pages[0].objects.push(t);
    const out = validateDoc(JSON.parse(JSON.stringify(doc))).doc.pages[0].objects[0];
    if (out.type !== 'text') throw new Error('expected text');
    expect(out.segVariants).toEqual({ '0': ['ss01', '-liga', 'salt=2'] });
    expect(out.glyphs['0.0']).toMatchObject({ alt: 'uni0628.alt', stretch: 1.5, dip: 150 });
    expect(out.glyphs['1.0'].alt).toBeNull();
    expect(out.glyphs['1.0'].stretch).toBe(8);
    expect(out.glyphs['1.0'].dip).toBe(300);
    // An unset dip stays unset (the style's default), also in files saved before it existed.
    expect(out.glyphs['2.0'].dip).toBeNull();
  });

  it('clamps numbers, sanitises colours and ignores unknown fields', () => {
    const raw = {
      format: 'khattat',
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

  it('opens projects saved under the legacy format id and re-tags them', () => {
    const { doc } = validateDoc({ format: 'midad', version: 1, title: 'قديم', pages: [] });
    expect(doc.format).toBe('khattat');
    expect(doc.title).toBe('قديم');
    expect(() => validateDoc({ format: 'other', version: 1, pages: [] })).toThrow();
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

describe('replaced fonts', () => {
  it('opens lines set in Layla Thuluth with the Thuluth font that replaced it', () => {
    const doc = createDoc();
    doc.pages[0].objects.push(createText({ text: 'بسم الله', fontId: 'layla-thuluth' }));
    const { doc: out, warnings } = validateDoc(JSON.parse(JSON.stringify(doc)));
    expect(out.pages[0].objects[0]).toMatchObject({ fontId: 'am-thulth' });
    expect(warnings).toEqual([]);
  });
});
