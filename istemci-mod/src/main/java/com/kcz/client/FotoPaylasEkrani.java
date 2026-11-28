package com.kcz.client;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.network.chat.Component;

/** Konumlu anı gönder: solda fotoğraf ve konumu, sağda arkadaşlar (birden fazla seçilebilir), altta not. */
public class FotoPaylasEkrani extends Screen {
	private final Screen onceki;
	private final Path dosya;
	private final Foto.Konum konum;
	private final Set<String> secili = new LinkedHashSet<>();
	private final List<Button> kisiler = new ArrayList<>();
	private EditBox not;
	private Button gonder;
	private boolean konumEkle = true;
	private Button konumDugme;
	private int px, py, pw, ph, resimW;

	public FotoPaylasEkrani(Screen onceki, Path dosya, Foto.Konum konum) {
		super(Component.literal(Dil.t("Konumlu anı")));
		this.onceki = onceki;
		this.dosya = dosya;
		this.konum = konum;
	}

	@Override
	protected void init() {
		pw = Math.min(470, this.width - 24);
		ph = Math.min(280, this.height - 20);
		px = (this.width - pw) / 2;
		py = (this.height - ph) / 2;
		resimW = (int) (pw * 0.6f);
		String eski = not != null ? not.getValue() : "";
		not = new EditBox(this.font, px + 10, py + ph - 28, resimW - 10, 18, Component.literal(Dil.t("Not")));
		not.setMaxLength(200);
		not.setHint(Component.literal(Dil.t("Not ekle (isteğe bağlı)")));
		not.setValue(eski);
		addRenderableWidget(not);
		konumDugme = addRenderableWidget(Button.builder(Component.empty(), b -> {
			konumEkle = !konumEkle;
			yazilariGuncelle();
		}).bounds(px + 10, py + ph - 52, 110, 18).build());
		konumDugme.visible = konum != null;

		// Arkadaşlar: oyunda olanlar önce (liste zaten öyle sıralı)
		kisiler.clear();
		int sx = px + resimW + 10, sw = pw - resimW - 20;
		int y = py + 28;
		int sigar = Math.max(1, (py + ph - 40 - y) / 22);
		List<Arkadaslar.Arkadas> l = Arkadaslar.liste();
		for (int i = 0; i < l.size() && i < sigar; i++) {
			Arkadaslar.Arkadas a = l.get(i);
			Button b = addRenderableWidget(Button.builder(Component.literal(a.ad()), x -> {
				if (!secili.remove(a.uuid())) secili.add(a.uuid());
				yazilariGuncelle();
			}).bounds(sx, y + i * 22, sw, 20).build());
			kisiler.add(b);
		}
		gonder = addRenderableWidget(Button.builder(Component.literal(Dil.t("Gönder")), b -> gonder())
				.bounds(px + resimW + 10, py + ph - 29, pw - resimW - 20, 20).build());
		addRenderableWidget(Button.builder(Component.literal("✕"), b -> onClose()).bounds(px + pw - 24, py + 6, 18, 18).build());
		yazilariGuncelle();
	}

	private void yazilariGuncelle() {
		List<Arkadaslar.Arkadas> l = Arkadaslar.liste();
		for (int i = 0; i < kisiler.size() && i < l.size(); i++) {
			Arkadaslar.Arkadas a = l.get(i);
			String durum = a.oyunda() ? "§a● " : a.cevrimici() ? "§e● " : "§8● ";
			kisiler.get(i).setMessage(Component.literal((secili.contains(a.uuid()) ? "§b✔ " : durum) + "§r" + a.ad()));
		}
		if (konumDugme != null) konumDugme.setMessage(Component.literal(konumEkle ? Dil.t("✔ Konumu ekle") : Dil.t("Konumu ekleme")));
		if (gonder != null) {
			gonder.active = !secili.isEmpty() && Arkadaslar.bagli();
			gonder.setMessage(Component.literal(secili.size() > 1 ? secili.size() + Dil.t(" kişiye gönder") : Dil.t("Gönder")));
		}
	}

	private void gonder() {
		int n = 0;
		String ad = "";
		for (Arkadaslar.Arkadas a : Arkadaslar.liste()) {
			if (!secili.contains(a.uuid())) continue;
			if (Arkadaslar.fotoGonder(this.minecraft, a, dosya, not.getValue(), konumEkle ? konum : null)) {
				n++;
				ad = a.ad();
			}
		}
		if (n > 0) {
			Arkadaslar.bildir(this.minecraft, Dil.t("Fotoğraf gidiyor"), n == 1 ? ad + Dil.t(" adlı arkadaşına") : n + Dil.t(" arkadaşına"));
			onClose();
		}
	}

	@Override
	public boolean keyPressed(KeyEvent e) {
		if (e.isConfirmation() && not.isFocused() && gonder.active) {
			gonder();
			return true;
		}
		return super.keyPressed(e);
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
		Ayar a = Ayar.get();
		int zemin = Ayar.renk(a.tema.zemin, 0xFF, 0xFF232328);
		int vurgu = Ayar.renk(a.tema.vurgu, 0xFF, 0xFFA1A1AA);
		int cizgi = Ayar.ac(zemin, 0.07f);
		g.fill(0, 0, this.width, this.height, 0x99000000);
		g.fill(px - 1, py - 1, px + pw + 1, py + ph + 1, Ayar.ac(zemin, 0.09f));
		g.fill(px, py, px + pw, py + ph, zemin);
		g.fill(px, py, px + 2, py + ph, vurgu);
		g.text(this.font, Dil.t("Konumlu anı"), px + 10, py + 10, 0xFFF1F5F9, false);
		g.fill(px + resimW, py + 24, px + resimW + 1, py + ph - 8, cizgi);
		// Fotoğraf
		int rx = px + 10, ry = py + 28, rw = resimW - 10, rh = ph - 28 - 60;
		if (konum == null) rh += 22;
		g.fill(rx, ry, rx + rw, ry + rh, 0xFF0B0B0D);
		Foto.Doku dk = Foto.doku(dosya);
		if (dk != null) Foto.ciz(g, dk, rx, ry, rw, rh);
		else g.centeredText(this.font, Dil.t("Yükleniyor…"), rx + rw / 2, ry + rh / 2 - 4, 0xFF9CA3AF);
		if (konum != null) {
			String k = this.font.plainSubstrByWidth(Foto.konumYazisi(konum), resimW - 10 - 118);
			g.text(this.font, k, px + 126, py + ph - 47, konumEkle ? 0xFFCBD5E1 : 0xFF6B7280, false);
		}
		// Sağ: arkadaşlar
		g.text(this.font, Dil.t("Kime?"), px + resimW + 10, py + 14, 0xFF9CA3AF, false);
		if (Arkadaslar.liste().isEmpty()) {
			g.text(this.font, Dil.t("Henüz arkadaşın yok."), px + resimW + 10, py + 32, 0xFF9CA3AF, false);
		} else if (!Arkadaslar.bagli()) {
			g.text(this.font, Dil.t("Launcher kapalı."), px + resimW + 10, py + ph - 44, 0xFFF87171, false);
		}
	}

	@Override
	public void tick() {
		super.tick();
		yazilariGuncelle();
	}
}
