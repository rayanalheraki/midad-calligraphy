import { insertIntoText } from './insertText';

const DOT = '◌';

const GROUPS: { title: string; items: { ch: string; name: string; mark?: boolean }[] }[] = [
  {
    title: 'الحركات',
    items: [
      { ch: 'َ', name: 'فتحة', mark: true },
      { ch: 'ُ', name: 'ضمة', mark: true },
      { ch: 'ِ', name: 'كسرة', mark: true },
      { ch: 'ْ', name: 'سكون', mark: true },
      { ch: 'ّ', name: 'شدّة', mark: true },
      { ch: 'ً', name: 'تنوين فتح', mark: true },
      { ch: 'ٌ', name: 'تنوين ضم', mark: true },
      { ch: 'ٍ', name: 'تنوين كسر', mark: true },
      { ch: 'ٰ', name: 'ألف خنجرية', mark: true },
      { ch: 'ٓ', name: 'مدّة', mark: true },
      { ch: 'ٔ', name: 'همزة فوق', mark: true },
      { ch: 'ٕ', name: 'همزة تحت', mark: true },
      { ch: 'ـ', name: 'كشيدة' },
    ],
  },
  {
    title: 'علامات المصحف',
    items: [
      { ch: 'ۖ', name: 'صلى', mark: true },
      { ch: 'ۗ', name: 'قلى', mark: true },
      { ch: 'ۚ', name: 'جيم', mark: true },
      { ch: 'ۛ', name: 'نقاط ثلاث', mark: true },
      { ch: 'ۘ', name: 'ميم صغيرة', mark: true },
      { ch: 'ۜ', name: 'سين صغيرة', mark: true },
      { ch: '۝', name: 'نهاية آية' },
      { ch: '۞', name: 'ربع الحزب' },
      { ch: '۩', name: 'سجدة' },
      { ch: '﴿', name: 'قوس مزخرف أيمن' },
      { ch: '﴾', name: 'قوس مزخرف أيسر' },
    ],
  },
  {
    title: 'رموز وعبارات',
    items: [
      { ch: '﷽', name: 'البسملة' },
      { ch: 'ﷲ', name: 'لفظ الجلالة' },
      { ch: 'ﷺ', name: 'صلى الله عليه وسلم' },
      { ch: 'ﷻ', name: 'جلّ جلاله' },
      { ch: '٭', name: 'نجمة' },
      { ch: '،', name: 'فاصلة' },
      { ch: '؛', name: 'فاصلة منقوطة' },
      { ch: '؟', name: 'علامة استفهام' },
      { ch: '‌', name: 'فاصل دون مسافة' },
    ],
  },
];

export function MarksPalette() {
  return (
    <div className="marks">
      {GROUPS.map((g) => (
        <div key={g.title} className="marks-group">
          <span className="marks-title">{g.title}</span>
          <div className="marks-grid">
            {g.items.map((it) => (
              <button
                key={it.ch}
                type="button"
                className="mark-btn"
                title={it.name}
                aria-label={it.name}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertIntoText(it.ch)}
              >
                {it.mark ? DOT + it.ch : it.ch === '‌' ? '|‌|' : it.ch}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
