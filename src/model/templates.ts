import { createPage, createShape, createText } from './defaults';
import type { Page } from './types';

export interface Template {
  id: string;
  name: string;
  description: string;
  build: () => Page;
}

const LAPIS = '#1f3a73';
const INK = '#1b1e27';

export const TEMPLATES: Template[] = [
  {
    id: 'basmala',
    name: 'بسملة بإطار مزخرف',
    description: 'نسخ مشكول بكشيدة، تعبئة ذهبية وإطار مزخرف.',
    build: () => {
      const p = createPage(297, 210, 'بسملة');
      p.background.color = '#fbf7ec';
      p.objects.push(createShape('ornateFrame', { x: 148.5, y: 105, w: 271, h: 184, stroke: { color: LAPIS, width: 1 }, fill: null, inner: 0.45 }));
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
      p.objects.push(createShape('divider', { x: 148.5, y: 122, w: 150, h: 7, fill: { kind: 'gold' }, stroke: { color: LAPIS, width: 0.5 } }));
      p.objects.push(createText({ text: '﴿ الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ﴾', fontId: 'amiri-quran', size: 12, x: 148.5, y: 150, fill: { kind: 'solid', color: LAPIS }, name: 'آية' }));
      return p;
    },
  },
  {
    id: 'shamsa',
    name: 'شمسة لفظ الجلالة',
    description: 'شمسة مذهّبة في وسطها لفظ الجلالة.',
    build: () => {
      const p = createPage(200, 200, 'شمسة');
      p.background.color = '#13264d';
      p.background.pattern = { kind: 'stars8', color: '#c9a23a', size: 20, opacity: 0.14 };
      p.objects.push(createShape('medallion', { x: 100, y: 100, w: 150, h: 150, points: 28, fill: { kind: 'gold' }, stroke: { color: '#6d4f10', width: 0.6 } }));
      p.objects.push(createText({ text: 'الله', fontId: 'amiri-bold', size: 44, x: 100, y: 113, fill: { kind: 'solid', color: LAPIS }, name: 'لفظ الجلالة' }));
      return p;
    },
  },
  {
    id: 'rosette',
    name: 'وردة متكررة',
    description: 'تكرار دوراني لكلمة واحدة حول مركز واحد، كما في كِلك.',
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
      p.objects.push(createShape('khatam', { x: 100, y: 100, w: 30, h: 30, fill: { kind: 'gold' }, stroke: { color: LAPIS, width: 0.5 } }));
      return p;
    },
  },
  {
    id: 'seal',
    name: 'ختم دائري',
    description: 'نص على قوس داخل حلقتين، ولفظ في المركز.',
    build: () => {
      const p = createPage(200, 200, 'ختم');
      p.background.color = '#fffdf8';
      p.objects.push(createShape('circle', { x: 100, y: 100, w: 176, h: 176, fill: null, stroke: { color: '#9b2f22', width: 1.6 } }));
      p.objects.push(createShape('circle', { x: 100, y: 100, w: 112, h: 112, fill: null, stroke: { color: '#9b2f22', width: 0.8 } }));
      p.objects.push(
        createText({
          text: 'لا إله إلا الله محمد رسول الله',
          fontId: 'aref-ruqaa-bold',
          size: 15,
          x: 100,
          y: 34,
          path: { mode: 'arc', radius: 66, sweep: 300, amplitude: 6, wavelength: 60, flip: false },
          fill: { kind: 'solid', color: '#9b2f22' },
          name: 'نص الحلقة',
        }),
      );
      p.objects.push(createText({ text: 'بسم الله', fontId: 'aref-ruqaa-bold', size: 20, x: 100, y: 106, fill: { kind: 'solid', color: '#9b2f22' }, name: 'المركز' }));
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
      p.objects.push(createShape('rhombus', { x: 110, y: 104, w: 6, h: 6, fill: { kind: 'solid', color: '#b4402f' } }));
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
      p.objects.push(createShape('khatam', { x: 75, y: 22, w: 13, h: 13, fill: { kind: 'gold' }, stroke: null }));
      p.objects.push(createText({ text: 'عيد مبارك', fontId: 'aref-ruqaa-bold', size: 24, x: 75, y: 58, fill: { kind: 'gold' }, name: 'التهنئة' }));
      p.objects.push(createText({ text: 'كل عام وأنتم بخير', fontId: 'reem-kufi', size: 7, x: 75, y: 79, fill: { kind: 'solid', color: '#e9edf5' }, name: 'تحية' }));
      return p;
    },
  },
  {
    id: 'verse',
    name: 'بيت شعر بالنستعليق',
    description: 'شطرا بيت للمتنبي في إطار مزدوج.',
    build: () => {
      const p = createPage(210, 148, 'بيت شعر');
      p.background.color = '#fffdf7';
      p.objects.push(createShape('doubleFrame', { x: 105, y: 74, w: 192, h: 130, fill: null, stroke: { color: '#7a5a12', width: 0.8 } }));
      p.objects.push(createText({ text: 'الخيل والليل والبيداء تعرفني', fontId: 'nastaliq', size: 12, x: 105, y: 62, fill: { kind: 'solid', color: INK }, name: 'الشطر الأول' }));
      p.objects.push(createText({ text: 'والسيف والرمح والقرطاس والقلم', fontId: 'nastaliq', size: 12, x: 105, y: 100, fill: { kind: 'solid', color: INK }, name: 'الشطر الثاني' }));
      return p;
    },
  },
  {
    id: 'mihrab',
    name: 'محراب كوفي',
    description: 'عبارة كوفية على قوس داخل محراب.',
    build: () => {
      const p = createPage(200, 260, 'محراب');
      p.background.color = '#ffffff';
      p.objects.push(createShape('arch', { x: 100, y: 140, w: 150, h: 210, fill: null, stroke: { color: LAPIS, width: 1.4 } }));
      p.objects.push(createShape('khatam', { x: 100, y: 92, w: 32, h: 32, fill: { kind: 'gold' }, stroke: { color: LAPIS, width: 0.4 } }));
      p.objects.push(
        createText({
          text: 'الحمد لله',
          fontId: 'reem-kufi-bold',
          size: 20,
          x: 100,
          y: 160,
          path: { mode: 'arc', radius: 70, sweep: 300, amplitude: 6, wavelength: 60, flip: false },
          fill: { kind: 'solid', color: LAPIS },
          name: 'الحمد لله',
        }),
      );
      return p;
    },
  },
];
