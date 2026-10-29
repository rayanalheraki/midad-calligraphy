import { createMark, createPage, createText } from './defaults';
import { findElement } from './elements';
import type { Fill, MarkObject, Page } from './types';

export interface Template {
  id: string;
  name: string;
  description: string;
  build: () => Page;
}

const LAPIS = '#1f3a73';
const INK = '#1b1e27';
const SEAL = '#9b2f22';

function element(id: string, x: number, y: number, size: number, fill: Fill, fontId = 'amiri'): MarkObject {
  const def = findElement(id)!;
  return createMark({ element: def.id, shape: def.shape, text: def.text, name: def.label, x, y, size, fill, fontId });
}

/** Advance of one tatweel in Amiri, in em. */
const AMIRI_TATWEEL_EM = 0.185;

/**
 * A closed ring drawn as a chain of tatweels bent along a circle of radius `r` centred on
 * (cx, cy). The size is tuned so that the chain meets itself exactly.
 */
function tatweelRing(cx: number, cy: number, r: number, count: number, fill: Fill, name: string) {
  const size = (2 * Math.PI * r) / (count * AMIRI_TATWEEL_EM);
  return createText({
    text: 'ـ'.repeat(count),
    fontId: 'amiri',
    size,
    x: cx,
    y: cy - r,
    path: { mode: 'arc', radius: r, sweep: 300, amplitude: 6, wavelength: 60, flip: false },
    fill,
    name,
  });
}

export const TEMPLATES: Template[] = [
  {
    id: 'seal',
    name: 'ختم دائري',
    description: 'عبارتان على قوسين متقابلين حول لفظ في المركز.',
    build: () => {
      const p = createPage(200, 200, 'ختم');
      p.background.color = '#fffdf8';
      const red: Fill = { kind: 'solid', color: SEAL };
      p.objects.push(tatweelRing(100, 100, 88, 214, red, 'الحلقة الخارجية'));
      p.objects.push(tatweelRing(100, 100, 48, 126, red, 'الحلقة الداخلية'));
      p.objects.push(
        createText({
          text: 'لا إله إلا الله محمد رسول الله',
          fontId: 'aref-ruqaa-bold',
          size: 14,
          x: 100,
          y: 100 - 64,
          path: { mode: 'arc', radius: 64, sweep: 300, amplitude: 6, wavelength: 60, flip: false },
          fill: red,
          name: 'القوس العلوي',
        }),
      );
      p.objects.push(
        createText({
          text: 'صلى الله عليه وسلم',
          fontId: 'aref-ruqaa-bold',
          size: 12,
          x: 100,
          y: 100 + 76,
          path: { mode: 'arc', radius: 76, sweep: 300, amplitude: 6, wavelength: 60, flip: true },
          fill: red,
          name: 'القوس السفلي',
        }),
      );
      p.objects.push(createText({ text: 'بسم الله', fontId: 'aref-ruqaa-bold', size: 20, x: 100, y: 106, fill: red, name: 'المركز' }));
      p.objects.push(element('rub-hizb', 100 - 68, 103, 12, red));
      p.objects.push(element('rub-hizb', 100 + 68, 103, 12, red));
      return p;
    },
  },
  {
    id: 'basmala',
    name: 'بسملة مذهّبة',
    description: 'نسخ مشكول بكشيدة وتعبئة ذهبية، وآية بين قوسين مزخرفين.',
    build: () => {
      const p = createPage(297, 210, 'بسملة');
      p.background.color = '#fbf7ec';
      p.objects.push(
        createText({
          text: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
          fontId: 'amiri',
          size: 26,
          kashida: 2,
          x: 148.5,
          y: 98,
          fill: { kind: 'gold' },
          stroke: { color: '#6d4f10', width: 0.25 },
          markColor: LAPIS,
          name: 'البسملة',
        }),
      );
      p.objects.push(element('dot1', 128.5, 124, 22, { kind: 'gold' }));
      p.objects.push(element('dot1', 148.5, 124, 22, { kind: 'gold' }));
      p.objects.push(element('dot1', 168.5, 124, 22, { kind: 'gold' }));
      p.objects.push(createText({ text: '﴿ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ﴾', fontId: 'amiri-quran', size: 12, x: 148.5, y: 150, fill: { kind: 'solid', color: LAPIS }, name: 'آية' }));
      return p;
    },
  },
  {
    id: 'rosette',
    name: 'وردة متكررة',
    description: 'تكرار دوراني لكلمة واحدة حول مركز واحد.',
    build: () => {
      const p = createPage(200, 200, 'وردة');
      p.background.color = '#ffffff';
      p.objects.push(
        createText({
          text: 'الله',
          fontId: 'reem-kufi-bold',
          size: 16,
          x: 100,
          y: 62,
          repeat: { count: 8, angle: 45, offset: 38 },
          fill: { kind: 'linear', from: LAPIS, to: '#3d6bb3', angle: 90 },
          name: 'وردة',
        }),
      );
      p.objects.push(element('rub-hizb', 100, 100, 24, { kind: 'gold' }));
      return p;
    },
  },
  {
    id: 'musanna',
    name: 'المُثنّى',
    description: 'عبارة ومرآتها متقابلتان، من أساليب الخط التقليدية.',
    build: () => {
      const p = createPage(220, 140, 'مثنى');
      p.background.color = '#f4f6fb';
      p.objects.push(createText({ text: 'ما شاء الله', fontId: 'aref-ruqaa-bold', size: 24, x: 110, y: 80, mirror: 'x', mirrorGap: 1, fill: { kind: 'solid', color: INK }, name: 'مثنى' }));
      p.objects.push(element('dot1', 110, 104, 30, { kind: 'solid', color: '#b4402f' }));
      return p;
    },
  },
  {
    id: 'eid',
    name: 'بطاقة تهنئة',
    description: 'خلفية متدرجة بنقش نجمي وعبارة بخط الرقعة.',
    build: () => {
      const p = createPage(150, 100, 'بطاقة');
      p.background.color = '#1f3a73';
      p.background.gradient = { from: '#1f3a73', to: '#0e1c3d', angle: 90 };
      p.background.pattern = { kind: 'stars8', color: '#c9a23a', size: 14, opacity: 0.13 };
      p.objects.push(element('star', 75, 24, 16, { kind: 'gold' }));
      p.objects.push(createText({ text: 'عيد مبارك', fontId: 'aref-ruqaa-bold', size: 24, x: 75, y: 58, fill: { kind: 'gold' }, name: 'التهنئة' }));
      p.objects.push(createText({ text: 'كل عام وأنتم بخير', fontId: 'reem-kufi', size: 7, x: 75, y: 79, fill: { kind: 'solid', color: '#e9edf5' }, name: 'تحية' }));
      return p;
    },
  },
  {
    id: 'verse',
    name: 'بيت شعر بالنستعليق',
    description: 'شطرا بيت للمتنبي بينهما فاصل من نقاط القلم.',
    build: () => {
      const p = createPage(210, 148, 'بيت شعر');
      p.background.color = '#fffdf7';
      p.objects.push(createText({ text: 'الخيل والليل والبيداء تعرفني', fontId: 'nastaliq', size: 12, x: 105, y: 58, fill: { kind: 'solid', color: INK }, name: 'الشطر الأول' }));
      p.objects.push(element('dot3', 105, 80, 18, { kind: 'solid', color: '#7a5a12' }));
      p.objects.push(createText({ text: 'والسيف والرمح والقرطاس والقلم', fontId: 'nastaliq', size: 12, x: 105, y: 104, fill: { kind: 'solid', color: INK }, name: 'الشطر الثاني' }));
      return p;
    },
  },
  {
    id: 'kufi-arc',
    name: 'قوس كوفي',
    description: 'عبارة كوفية على قوس تعلوها علامة مذهّبة.',
    build: () => {
      const p = createPage(200, 200, 'قوس كوفي');
      p.background.color = '#ffffff';
      p.objects.push(element('rub-hizb', 100, 70, 26, { kind: 'gold' }));
      p.objects.push(
        createText({
          text: 'الحمد لله',
          fontId: 'reem-kufi-bold',
          size: 20,
          x: 100,
          y: 128,
          path: { mode: 'arc', radius: 70, sweep: 300, amplitude: 6, wavelength: 60, flip: false },
          fill: { kind: 'solid', color: LAPIS },
          name: 'الحمد لله',
        }),
      );
      return p;
    },
  },
];
