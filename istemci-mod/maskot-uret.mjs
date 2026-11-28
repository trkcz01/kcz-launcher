// ui/maskot.js'teki piksel çizimlerden oyun içi menünün MaskotCizim.java dosyasını üretir.
// Çizim değişince: node istemci-mod/maskot-uret.mjs  (DERLE.ps1'den önce)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const kok = path.dirname(fileURLToPath(import.meta.url));
globalThis.window = {};
globalThis.document = { addEventListener() {} };
await import(new URL('file:///' + path.join(kok, '..', 'ui', 'maskot.js').replace(/\\/g, '/')));
const S = globalThis.window.kczMaskot.SPRITE;

const renk = (h) => '0xFF' + h.replace('#', '').toUpperCase();
const satirlar = [];
for (const [ad, sp] of Object.entries(S)) {
  if (ad.startsWith('ada')) continue; // sahne süsleri sadece launcher'da
  const palet = Object.entries(sp.palet).map(([c, h]) => `'${c}', ${renk(h)}`).join(', ');
  const parcalar = Object.entries(sp.parcalar).map(([p, t]) => {
    const { x = 0, y = 0, s } = Array.isArray(t) ? { s: t } : t;
    return `\t\t\t\tnew Parca("${p}", ${x}, ${y}, new String[] { ${s.map((r) => `"${r}"`).join(', ')} })`;
  }).join(',\n');
  satirlar.push(`\t\tHEPSI.put("${ad}", new Sprite(${sp.w}, ${sp.h}, paletYap(${palet}), new Parca[] {\n${parcalar} }));`);
}

const java = `package com.kcz.client;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Tema maskotlarının piksel çizimleri. BU DOSYA ÜRETİLİR: ui/maskot.js'teki SPRITE'tan
 * istemci-mod/maskot-uret.mjs yazar. Elle değiştirme; çizimi maskot.js'te değiştirip yeniden üret.
 */
final class MaskotCizim {
	private MaskotCizim() {
	}

	/** Bir parçanın yan yana aynı renkteki pikselleri tek dikdörtgen: {x, y, genişlik, renk} */
	record Parca(String ad, int x, int y, String[] s) {
	}

	record Sprite(int w, int h, Map<Character, Integer> palet, Parca[] parcalar) {
		Parca parca(String ad) {
			for (Parca p : parcalar) if (p.ad().equals(ad)) return p;
			return null;
		}

		/** Parçanın çizilecek dikdörtgenleri {x, y, genişlik, renk} (önbellekli) */
		List<int[]> kosular(String ad) {
			return KOSU.computeIfAbsent(this, k -> new HashMap<>()).computeIfAbsent(ad, a -> {
				List<int[]> l = new ArrayList<>();
				Parca p = parca(a);
				if (p == null) return l;
				for (int j = 0; j < p.s().length; j++) {
					String r = p.s()[j];
					for (int i = 0; i < r.length();) {
						char c = r.charAt(i);
						if (c == '.') {
							i++;
							continue;
						}
						int n = 1;
						while (i + n < r.length() && r.charAt(i + n) == c) n++;
						l.add(new int[] { p.x() + i, p.y() + j, n, palet.getOrDefault(c, 0xFFFF00FF) });
						i += n;
					}
				}
				return l;
			});
		}
	}

	private static final Map<Sprite, Map<String, List<int[]>>> KOSU = new HashMap<>();
	static final Map<String, Sprite> HEPSI = new HashMap<>();

	private static Map<Character, Integer> paletYap(Object... cift) {
		Map<Character, Integer> m = new HashMap<>();
		for (int i = 0; i < cift.length; i += 2) m.put((Character) cift[i], (Integer) cift[i + 1]);
		return m;
	}

	static {
${satirlar.join('\n')}
	}
}
`;
const hedef = path.join(kok, 'src', 'main', 'java', 'com', 'kcz', 'client', 'MaskotCizim.java');
fs.writeFileSync(hedef, java.replace(/\n/g, '\r\n'));
console.log('yazıldı', hedef, Object.keys(S).filter((a) => !a.startsWith('ada')).join(', '));
