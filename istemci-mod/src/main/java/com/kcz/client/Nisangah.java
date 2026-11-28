package com.kcz.client;

import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.world.level.GameType;

import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement;

/** Özel nişangah: şekil, renk, boyut; yaratığa bakınca rengi değişebilir. Kapalıyken oyunun kendi nişangahı. */
public final class Nisangah {
	private Nisangah() {
	}

	public static final String[] SEKILLER = { "arti", "nokta", "arti-nokta", "kose", "daire" };
	public static final String[] SEKIL_ADI = { Dil.t("Artı"), Dil.t("Nokta"), Dil.t("Artı + nokta"), Dil.t("Köşeler"), Dil.t("Halka") };
	public static final String[] RENKLER = { "beyaz", "tema", "yesil", "kirmizi", "sari", "mavi" };
	public static final String[] RENK_ADI = { Dil.t("Beyaz"), Dil.t("Tema"), Dil.t("Yeşil"), Dil.t("Kırmızı"), Dil.t("Sarı"), Dil.t("Mavi") };

	public static HudElement sar(HudElement oyununki) {
		return (g, d) -> {
			if (true) { // özel nişangah kaldırıldı, oyunun kendi nişangahı
				oyununki.extractRenderState(g, d);
				return;
			}
			ciz(g, d);
		};
	}

	private static int renk(Ayar a) {
		return switch (a.nisangahRenk) {
			case "tema" -> Ayar.renk(a.tema.vurgu, 0xFF, 0xFFFFFFFF);
			case "yesil" -> 0xFF4ADE80;
			case "kirmizi" -> 0xFFF87171;
			case "sari" -> 0xFFFACC15;
			case "mavi" -> 0xFF60A5FA;
			default -> 0xFFFFFFFF;
		};
	}

	private static void ciz(GuiGraphicsExtractor g, DeltaTracker d) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null || !mc.options.getCameraType().isFirstPerson()) return;
		if (mc.gameMode != null && mc.gameMode.getPlayerMode() == GameType.SPECTATOR && mc.crosshairPickEntity == null) return;
		Ayar a = Ayar.get();
		int r = renk(a);
		// Bir yaratığa/oyuncuya bakınca kırmızı (kırmızı seçiliyse beyaz)
		if (a.nisangahDinamik && mc.crosshairPickEntity != null) r = "kirmizi".equals(a.nisangahRenk) ? 0xFFFFFFFF : 0xFFEF4444;
		int golge = 0x99000000;
		int cx = g.guiWidth() / 2, cy = g.guiHeight() / 2;
		int b = Math.max(1, Math.min(3, a.nisangahBoyut));
		int uzun = 2 + b * 2, ara = 1 + b / 2;
		switch (a.nisangahSekil) {
			case "nokta" -> kutu(g, cx - b / 2 - 1, cy - b / 2 - 1, b + 1, b + 1, r, golge);
			case "kose" -> {
				int k = 2 + b, s = ara + 2;
				for (int sx = -1; sx <= 1; sx += 2) {
					for (int sy = -1; sy <= 1; sy += 2) {
						int x = cx + sx * s, y = cy + sy * s;
						kutu(g, sx < 0 ? x - k + 1 : x, y, k, 1, r, golge);
						kutu(g, x, sy < 0 ? y - k + 1 : y, 1, k, r, golge);
					}
				}
			}
			case "daire" -> {
				int yc = 3 + b;
				for (int i = 0; i < 32; i++) {
					double t = i * Math.PI * 2 / 32;
					int x = cx + (int) Math.round(Math.cos(t) * yc), y = cy + (int) Math.round(Math.sin(t) * yc);
					g.fill(x, y, x + 1, y + 1, r);
				}
				g.fill(cx, cy, cx + 1, cy + 1, r);
			}
			default -> {
				// Artı (ortası boş), "arti-nokta"da ortada nokta da var
				kutu(g, cx - ara - uzun, cy, uzun, 1, r, golge);
				kutu(g, cx + ara + 1, cy, uzun, 1, r, golge);
				kutu(g, cx, cy - ara - uzun, 1, uzun, r, golge);
				kutu(g, cx, cy + ara + 1, 1, uzun, r, golge);
				if ("arti-nokta".equals(a.nisangahSekil)) kutu(g, cx, cy, 1, 1, r, golge);
			}
		}
	}

	/** İnce gölgeli dikdörtgen (her arka planda görünsün) */
	private static void kutu(GuiGraphicsExtractor g, int x, int y, int w, int h, int r, int golge) {
		g.fill(x - 1, y - 1, x + w + 1, y + h + 1, golge);
		g.fill(x, y, x + w, y + h, r);
	}
}
