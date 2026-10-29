// Browser-side font loading. Built-in font files are bundled by Vite as local assets,
// so the app never requests fonts from a third-party server.
import amiri from '@expo-google-fonts/amiri/400Regular/Amiri_400Regular.ttf?url';
import amiriBold from '@expo-google-fonts/amiri/700Bold/Amiri_700Bold.ttf?url';
import amiriQuran from '@expo-google-fonts/amiri-quran/400Regular/AmiriQuran_400Regular.ttf?url';
import scheherazade from '@expo-google-fonts/scheherazade-new/400Regular/ScheherazadeNew_400Regular.ttf?url';
import scheherazadeBold from '@expo-google-fonts/scheherazade-new/700Bold/ScheherazadeNew_700Bold.ttf?url';
import lateef from '@expo-google-fonts/lateef/400Regular/Lateef_400Regular.ttf?url';
import mirza from '@expo-google-fonts/mirza/400Regular/Mirza_400Regular.ttf?url';
import arefRuqaa from '@expo-google-fonts/aref-ruqaa/400Regular/ArefRuqaa_400Regular.ttf?url';
import arefRuqaaBold from '@expo-google-fonts/aref-ruqaa/700Bold/ArefRuqaa_700Bold.ttf?url';
import reemKufi from '@expo-google-fonts/reem-kufi/400Regular/ReemKufi_400Regular.ttf?url';
import reemKufiBold from '@expo-google-fonts/reem-kufi/700Bold/ReemKufi_700Bold.ttf?url';
import qahiri from '@expo-google-fonts/qahiri/400Regular/Qahiri_400Regular.ttf?url';
import nastaliq from '@expo-google-fonts/noto-nastaliq-urdu/400Regular/NotoNastaliqUrdu_400Regular.ttf?url';
import nastaliqBold from '@expo-google-fonts/noto-nastaliq-urdu/700Bold/NotoNastaliqUrdu_700Bold.ttf?url';
import gulzar from '@expo-google-fonts/gulzar/400Regular/Gulzar_400Regular.ttf?url';
import alkalami from '@expo-google-fonts/alkalami/400Regular/Alkalami_400Regular.ttf?url';
import katibeh from '@expo-google-fonts/katibeh/400Regular/Katibeh_400Regular.ttf?url';
import rakkas from '@expo-google-fonts/rakkas/400Regular/Rakkas_400Regular.ttf?url';
import lalezar from '@expo-google-fonts/lalezar/400Regular/Lalezar_400Regular.ttf?url';
import jomhuria from '@expo-google-fonts/jomhuria/400Regular/Jomhuria_400Regular.ttf?url';
import marhey from '@expo-google-fonts/marhey/400Regular/Marhey_400Regular.ttf?url';
import elMessiri from '@expo-google-fonts/el-messiri/400Regular/ElMessiri_400Regular.ttf?url';
import ruwudu from '@expo-google-fonts/ruwudu/400Regular/Ruwudu_400Regular.ttf?url';
import ruwuduBold from '@expo-google-fonts/ruwudu/700Bold/Ruwudu_700Bold.ttf?url';
import amThulth from '../assets/fonts/amoshref/AMoshref-Thulth.ttf?url';
import laylaDiwani from '../assets/fonts/layla/LaylaDiwani.ttf?url';
import { findFontDef, getLoadedFont, loadFontFromBuffer, type LoadedFont } from './fonts';
import { loadUserFontData } from '../io/storage';

const URLS: Record<string, string> = {
  amiri,
  'amiri-bold': amiriBold,
  'amiri-quran': amiriQuran,
  scheherazade,
  'scheherazade-bold': scheherazadeBold,
  lateef,
  mirza,
  'am-thulth': amThulth,
  ruwudu,
  'ruwudu-bold': ruwuduBold,
  'layla-diwani': laylaDiwani,
  'aref-ruqaa': arefRuqaa,
  'aref-ruqaa-bold': arefRuqaaBold,
  'reem-kufi': reemKufi,
  'reem-kufi-bold': reemKufiBold,
  qahiri,
  nastaliq,
  'nastaliq-bold': nastaliqBold,
  gulzar,
  alkalami,
  katibeh,
  rakkas,
  lalezar,
  jomhuria,
  marhey,
  'el-messiri': elMessiri,
};

const pending = new Map<string, Promise<LoadedFont>>();

export function ensureFont(id: string): Promise<LoadedFont> {
  const ready = getLoadedFont(id);
  if (ready) return Promise.resolve(ready);
  const inflight = pending.get(id);
  if (inflight) return inflight;
  const def = findFontDef(id);
  if (!def) return Promise.reject(new Error('خط غير معروف: ' + id));
  const p = (async () => {
    let data: ArrayBuffer;
    if (def.builtin) {
      const url = URLS[id];
      if (!url) throw new Error('ملف الخط غير موجود: ' + id);
      const res = await fetch(url);
      if (!res.ok) throw new Error('تعذّر تحميل الخط ' + def.name);
      data = await res.arrayBuffer();
    } else {
      const stored = await loadUserFontData(id);
      if (!stored) throw new Error('الخط المضاف غير موجود في المتصفح: ' + def.name);
      data = stored;
    }
    return loadFontFromBuffer(def, data);
  })();
  pending.set(id, p);
  p.catch(() => pending.delete(id));
  return p;
}
