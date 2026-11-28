package com.kcz.client;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * Menü dili. Launcher "English" seçiliyse config/kcz-client.json'a "dil": "en" yazar; o zaman
 * menüdeki Türkçe yazılar assets/kcz-client/dil/en.json'daki karşılıklarıyla gösterilir.
 * Karşılığı olmayan yazı Türkçe kalır (oyun bozulmaz).
 */
public final class Dil {
	private Dil() {
	}

	private static volatile Map<String, String> en = null;

	public static boolean ingilizce() {
		return "en".equals(Ayar.get().dil);
	}

	public static String t(String s) {
		if (s == null || !ingilizce()) return s;
		Map<String, String> m = en;
		if (m == null) en = m = yukle();
		String c = m.get(s);
		return c != null ? c : s;
	}

	private static Map<String, String> yukle() {
		Map<String, String> m = new HashMap<>();
		try (InputStream in = Dil.class.getResourceAsStream("/assets/kcz-client/dil/en.json")) {
			if (in == null) return m;
			JsonObject o = JsonParser.parseString(new String(in.readAllBytes(), StandardCharsets.UTF_8)).getAsJsonObject();
			for (Map.Entry<String, JsonElement> e : o.entrySet()) {
				if (e.getValue().isJsonPrimitive()) m.put(e.getKey(), e.getValue().getAsString());
			}
		} catch (Exception e) {
			KczClient.LOG.warn("KCZ dil dosyası okunamadı: {}", e.toString());
		}
		return m;
	}
}
