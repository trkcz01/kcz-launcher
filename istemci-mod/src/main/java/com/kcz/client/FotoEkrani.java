package com.kcz.client;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/** Gelen (ya da gönderilen) konumlu anıyı tam ekran gösterir: not, konum, "Yol göster" ve "Sunucuya katıl". */
public class FotoEkrani extends Screen {
	private final Screen onceki;
	private final long id;
	private final String kimin;
	private Foto.Bilgi bilgi;
	private Button yol, katil;

	public FotoEkrani(Screen onceki, long id, String kimin) {
		super(Component.literal("Konumlu anı"));
		this.onceki = onceki;
		this.id = id;
		this.kimin = kimin;
	}

	@Override
	protected void init() {
		bilgi = Foto.bilgi(id);
		int y = this.height - 28;
		int w = 110;
		int x = this.width / 2;
		yol = addRenderableWidget(Button.builder(Component.literal("Yol göster"), b -> {
			if (Foto.yolAcik()) {
				Foto.yoluKapat();
			} else if (bilgi != null && bilgi.konum() != null) {
				Foto.yolGoster(bilgi.konum(), bilgi.benden() ? null : kimin);
				this.minecraft.gui.setScreen(null);
				return;
			}
			guncelle();
		}).bounds(x - w - w / 2 - 6, y, w, 20).build());
		katil = addRenderableWidget(Button.builder(Component.literal("Sunucuya katıl"), b -> {
			if (bilgi != null && bilgi.konum() != null) Arkadaslar.katil(this.minecraft, bilgi.konum().sunucu());
		}).bounds(x - w / 2, y, w, 20).build());
		addRenderableWidget(Button.builder(Component.literal("Kapat"), b -> onClose()).bounds(x + w / 2 + 6, y, w, 20).build());
		guncelle();
	}

	private void guncelle() {
		Foto.Konum k = bilgi == null ? null : bilgi.konum();
		boolean burada = k != null && this.minecraft.level != null && Foto.ayniSunucu(this.minecraft, k);
		yol.active = Foto.yolAcik() || burada;
		yol.setMessage(Component.literal(Foto.yolAcik() ? "Yolu kapat" : "Yol göster"));
		katil.active = k != null && !k.sunucu().isEmpty() && !burada;
	}

	@Override
	public void tick() {
		super.tick();
		if (bilgi == null) {
			bilgi = Foto.bilgi(id);
			if (bilgi != null) guncelle();
		}
	}

	@Override
	public void onClose() {
		this.minecraft.gui.setScreen(onceki);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float d) {
		g.fill(0, 0, this.width, this.height, 0xE6000000);
		int ust = 10, alt = this.height - 64;
		Foto.Doku dk = Foto.doku(Foto.png(id));
		if (dk != null) {
			int[] r = Foto.ciz(g, dk, 16, ust, this.width - 32, alt - ust);
			g.fill(r[0] - 1, r[1] - 1, r[0] + r[2] + 1, r[1], 0x33FFFFFF);
		} else {
			g.centeredText(this.font, "Fotoğraf yükleniyor…", this.width / 2, (ust + alt) / 2, 0xFF9CA3AF);
		}
		int y = alt + 6;
		String kim = bilgi != null && bilgi.benden() ? "Senin gönderdiğin" : kimin == null ? "Arkadaşının anısı" : kimin + "'in anısı";
		String not = bilgi == null || bilgi.not().isEmpty() ? "" : "  ·  \"" + bilgi.not() + "\"";
		g.centeredText(this.font, this.font.plainSubstrByWidth(kim + not, this.width - 40), this.width / 2, y, 0xFFF1F5F9);
		if (bilgi != null && bilgi.konum() != null) {
			g.centeredText(this.font, Foto.konumYazisi(bilgi.konum()), this.width / 2, y + 12, 0xFF9CA3AF);
		} else if (bilgi != null) {
			g.centeredText(this.font, "Konum eklenmemiş", this.width / 2, y + 12, 0xFF6B7280);
		}
	}
}
