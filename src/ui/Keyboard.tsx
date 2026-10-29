import { useEditor } from '../store/editor';
import { insertIntoText } from './insertText';
import { IconClose } from './icons';

// Standard Arabic layout rows, plus Persian/Urdu letters and diacritics,
// in the spirit of Kelk's customizable keyboard.
const ROWS: string[][] = [
  ['ذ', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '٠'],
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج', 'د'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['ئ', 'ء', 'ؤ', 'ر', 'لا', 'ى', 'ة', 'و', 'ز', 'ظ'],
  ['أ', 'إ', 'آ', 'ٱ', 'پ', 'چ', 'ژ', 'گ', 'ک', 'ی', 'ۀ'],
];
const MARKS = ['َ', 'ً', 'ُ', 'ٌ', 'ِ', 'ٍ', 'ْ', 'ّ', 'ٰ', 'ٓ', 'ـ'];

export function KeyboardPanel() {
  const st = useEditor.getState();
  return (
    <div className="keyboard" role="dialog" aria-label="لوحة المفاتيح العربية">
      <div className="keyboard-head">
        <span>لوحة المفاتيح العربية</span>
        <button type="button" className="icon-btn" aria-label="إغلاق لوحة المفاتيح" onClick={() => st.setKeyboardOpen(false)}>
          <IconClose />
        </button>
      </div>
      {ROWS.map((row, i) => (
        <div key={i} className="kb-row">
          {row.map((k) => (
            <button key={k} type="button" className="kb-key" onMouseDown={(e) => e.preventDefault()} onClick={() => insertIntoText(k)}>
              {k}
            </button>
          ))}
        </div>
      ))}
      <div className="kb-row">
        {MARKS.map((m) => (
          <button key={m} type="button" className="kb-key mark" onMouseDown={(e) => e.preventDefault()} onClick={() => insertIntoText(m)}>
            {m === 'ـ' ? 'ـ' : '◌' + m}
          </button>
        ))}
      </div>
      <div className="kb-row">
        <button type="button" className="kb-key wide" onMouseDown={(e) => e.preventDefault()} onClick={() => insertIntoText('‌')}>
          فاصل ‌دون مسافة
        </button>
        <button type="button" className="kb-key space" onMouseDown={(e) => e.preventDefault()} onClick={() => insertIntoText(' ')}>
          مسافة
        </button>
        <button type="button" className="kb-key wide" onMouseDown={(e) => e.preventDefault()} onClick={() => insertIntoText(null)}>
          حذف ⌫
        </button>
      </div>
    </div>
  );
}
