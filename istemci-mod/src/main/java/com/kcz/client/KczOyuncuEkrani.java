package com.kcz.client;

import com.google.gson.JsonObject;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * Bir KÇZ oyuncusuna eğilip sağ tıklayınca açılan küçük menü.
 * Arkadaşsa: mesaj gönder. Değilse: arkadaş ekle (launcher, oyuncunun KÇZ profilindeki ID'yle istek gönderir).
 */
public class KczOyuncuEkrani extends Screen {
	private static final int PW = 230;
	private static final int PH = 108;

	private final KczOyunculari.Kisi kisi;
	private boolean istekGitti = false;
	private int px, py;

	public KczOyuncuEkrani(KczOyunculari.Kisi kisi) {
		super(Component.literal(kisi.ad()));
		this.kisi = kisi;
	}

	/** Bu oyuncu arkadaş listemizde mi? (ad ya da uuid ile) */
	private Arkadaslar.Arkadas arkadas() {
		String u = kisi.uuid() == null ? "" : kisi.uuid().replace("-", "");
		for (Arkadaslar.Arkadas a : Arkadaslar.liste()) {
			if (a.ad().equalsIgnoreCase(kisi.ad())) return a;
			if (!u.isEmpty() && a.uuid().replace("-", "").equalsIgnoreCase(u)) return a;
		}
		return null;
	}

	@Override
	protected void init() {
		px = (this.width - PW) / 2;
		py = (this.height - PH) / 2;
		int x = px + 12;
		int w = PW - 24;
		int y = py + 48;
		Arkadaslar.Arkadas a = arkadas();
		if (a != null) {
			addRenderableWidget(Button.builder(Component.literal(Dil.t("Mesaj gönder")),
					b -> this.minecraft.gui.setScreen(new SohbetEkrani(this, a))).bounds(x, y, w, 20).build());
		} else {
			Button ekle = addRenderableWidget(Button.builder(
					Component.literal(istekGitti ? Dil.t("İstek gönderildi ✔") : Dil.t("Arkadaş ekle")), b -> {
						JsonObject o = new JsonObject();
						o.addProperty("tur", "arkadas_ekle_uuid");
						o.addProperty("uuid", kisi.uuid());
						o.addProperty("ad", kisi.ad());
						if (Arkadaslar.istekBirak(this.minecraft, o)) {
							istekGitti = true;
							rebuildWidgets();
						}
					}).bounds(x, y, w, 20).build());
			ekle.active = !istekGitti && kisi.uuid() != null && !kisi.uuid().isEmpty() && Arkadaslar.bagli();
		}
		addRenderableWidget(Button.builder(Component.literal(Dil.t("Kapat")), b -> onClose()).bounds(x, y + 26, w, 20).build());
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float d) {
		Ayar ay = Ayar.get();
		int zemin = Ayar.renk(ay.tema.zemin, 0xFF, 0xFF232328);
		int vurgu = Ayar.renk(ay.tema.vurgu, 0xFF, 0xFFA1A1AA);
		g.fill(0, 0, this.width, this.height, 0x66000000);
		g.fill(px - 1, py - 1, px + PW + 1, py + PH + 1, Ayar.ac(zemin, 0.09f));
		g.fill(px, py, px + PW, py + PH, zemin);
		g.fill(px, py, px + 2, py + PH, vurgu);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float d) {
		super.extractRenderState(g, mx, my, d);
		int x = px + 12;
		g.text(this.font, Component.empty().append(KczOyunculari.SIMGE).append(" ").append(kisi.ad()), x, py + 12, 0xFFF1F5F9, false);
		Arkadaslar.Arkadas a = arkadas();
		String alt = a != null ? Dil.t("Arkadaşın · KÇZ kullanıyor")
				: !Arkadaslar.bagli() ? Dil.t("KÇZ Launcher kapalı görünüyor")
				: istekGitti ? Dil.t("Kabul edince arkadaş listende görünür")
				: Dil.t("KÇZ kullanıyor");
		g.text(this.font, alt, x, py + 27, 0xFF9CA3AF, false);
	}
}
