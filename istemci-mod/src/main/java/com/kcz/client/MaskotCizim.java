package com.kcz.client;

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
		HEPSI.put("enderman", new Sprite(10, 27, paletYap('k', 0xFF0B0A10, 'd', 0xFF211C2B, 'a', 0xFF17131E, 'p', 0xFF9D2FC0, 'e', 0xFFE57CF6, 'E', 0xFFFDE7FF), new Parca[] {
				new Parca("govde", 0, 0, new String[] { ".kkkkkkkk.", ".kdkkkkdk.", ".kkkkkkkk.", ".kkkkkkkk.", ".kkkkkkkk.", ".kkkkkkkk.", ".kkkkkkkk.", ".kkkkkkkk.", "..kkkkkk..", "..kkkkkk..", "..kkkkkk..", "..kkkkkk..", "..kkkkkk..", "..kkkkkk..", "..kkkkkk..", "..kk..kk..", "..kk..kk..", "..kk..kk..", "..kk..kk..", "..kk..kk..", "..kk..kk..", "..kk..kk..", "..kk..kk..", "..kk..kk..", "..kk..kk..", "..kk..kk..", "..dk..kd.." }),
				new Parca("kolS", 0, 8, new String[] { "aa", "aa", "aa", "aa", "aa", "aa", "aa", "aa", "aa", "aa", "aa", "da" }),
				new Parca("kolD", 8, 8, new String[] { "aa", "aa", "aa", "aa", "aa", "aa", "aa", "aa", "aa", "aa", "aa", "ad" }),
				new Parca("gozler", 1, 4, new String[] { "peE..Eep" }) }));
		HEPSI.put("creeper", new Sprite(8, 19, paletYap('g', 0xFF5FB34D, 'G', 0xFF418C35, 'l', 0xFF93D575, 's', 0xFF2F6A27, 'k', 0xFF101010), new Parca[] {
				new Parca("kafa", 0, 0, new String[] { "glgGglGg", "GglggGgl", "gkkggkkg", "lkkGlkkg", "gGgkkgGg", "Ggkkkkgl", "glkkkkGg", "ggkGgkgG" }),
				new Parca("govde", 1, 8, new String[] { "gGgglG", "lggGgg", "GgsgGl", "gglgGg", "gGggsg", "sgGlgg", "ggGgsG" }),
				new Parca("bacaklar", 0, 15, new String[] { "gGg..gGg", "ggs..sgg", "Gsg..gsG", "sss..sss" }) }));
		HEPSI.put("ghast", new Sprite(12, 18, paletYap('w', 0xFFF4F4F5, 'W', 0xFFD4D4D8, 'o', 0xFFA1A1AA, 'f', 0xFF3F3F46, 'r', 0xFFB91C1C, 'R', 0xFFF87171), new Parca[] {
				new Parca("govde", 0, 0, new String[] { ".wwwwwwwwww.", "wwwwwwwwwwwW", "wwwwwwwwwwwW", "wwwwwwwwwwwW", "wwwwwwwwwwwW", "wwwwwwwwwwwW", "wwwwwwwwwwwW", "wwwwwwwwwwwW", "WwwwwwwwwwWW", "WWwwwwwwwWWW", ".WWWWWWWWWW." }),
				new Parca("yuzS", 1, 3, new String[] { "ff.....ff.", "o......o..", "o......o..", "...ffff..." }),
				new Parca("yuzK", 1, 2, new String[] { "fff....fff", "fff....fff", "rRr....rRr", "..........", "..ffffff..", "..frrrrf..", "..ffffff.." }),
				new Parca("t0", 1, 11, new String[] { "W", "W", "W", "W", "o" }),
				new Parca("t1", 3, 11, new String[] { "W", "W", "W", "W", "W", "W", "o" }),
				new Parca("t2", 5, 11, new String[] { "W", "W", "W", "W", "W", "o" }),
				new Parca("t3", 7, 11, new String[] { "W", "W", "W", "W", "W", "W", "o" }),
				new Parca("t4", 10, 11, new String[] { "W", "W", "W", "W", "o" }) }));
		HEPSI.put("yarasa", new Sprite(8, 10, paletYap('b', 0xFF8A6A52, 'B', 0xFF4F3B2D, 'k', 0xFF1F1712), new Parca[] {
				new Parca("asili", 0, 0, new String[] { "...kk...", "..BbbB..", ".BBbbBB.", "BBBbbBBB", "BBBbbBBB", ".BBbbBB.", "..BbbB..", "..bbbb..", ".bkbbkb.", ".b....b." }) }));
		HEPSI.put("yarasaUcan", new Sprite(15, 7, paletYap('b', 0xFF8A6A52, 'B', 0xFF5C4535, 'e', 0xFFFCA5A5), new Parca[] {
				new Parca("kanatA", 0, 0, new String[] { "B.....b.b.....B", "BB....bbb....BB", "BBB..bebeb..BBB", ".BBBBbbbbbBBBB.", "..BBBbbbbbBBB..", "......bbb......", ".......b......." }),
				new Parca("kanatB", 0, 0, new String[] { "......b.b......", "......bbb......", ".....bebeb.....", ".BBBBbbbbbBBBB.", "BBB..bbbbb..BBB", "BB....bbb....BB", "B......b......B" }) }));
		HEPSI.put("kedi", new Sprite(11, 13, paletYap('g', 0xFFA1A1AA, 'G', 0xFF6B7280, 'w', 0xFFF4F4F5, 'p', 0xFFF9A8D4, 'e', 0xFF86EFAC, 'k', 0xFF18181B), new Parca[] {
				new Parca("kuyruk", 7, 5, new String[] { "...G", "..gg", "..g.", ".gg.", ".g..", "gg..", "g..." }),
				new Parca("govde", 0, 0, new String[] { "G.....G....", "gp...pg....", "ggGgGgg....", "ggggggg....", "ggwpwgg....", ".gwwwg.....", ".gGgGg.....", "gggwggg....", "gGgwgGg....", "ggwwwgg....", "gGgwgGg....", "gggwggg....", ".ww.ww....." }),
				new Parca("gozAcik", 1, 3, new String[] { "ek.ke" }),
				new Parca("gozKapali", 1, 3, new String[] { "GG.GG" }) }));
		HEPSI.put("ates", new Sprite(5, 5, paletYap('y', 0xFFFDE047, 'Y', 0xFFFFFBE0, 'o', 0xFFF97316, 'r', 0xFFC2410C), new Parca[] {
				new Parca("top", 0, 0, new String[] { ".oro.", "oyYyo", "ryYyr", "oyyyo", ".ror." }) }));
	}
}
