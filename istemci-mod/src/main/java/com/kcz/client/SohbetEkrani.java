package com.kcz.client;

import java.util.ArrayList;
import java.util.List;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

/**
 * Oyun içinde arkadaşla özel sohbet. Mesajlar launcher üzerinden gider; arkadaş başka
 * sunucuda ya da oyunda olmasa da ulaşır (launcher'da da görür).
 */
public class SohbetEkrani extends Screen {
	private final Screen onceki;
	private Arkadaslar.Arkadas kim;
	private EditBox kutu;
	private Button gonder, davet, katil, geri, foto;
	/** Bu karede çizilen fotoğraf balonları: {x, y, w, h, id} (tıklayınca açılır) */
	private final List<long[]> fotoAlanlari = new ArrayList<>();
	private int px, py, pw, ph;
	/** Yukarı kaydırma miktarı (piksel) */
	private int kaydir = 0;

	public SohbetEkrani(Screen onceki, Arkadaslar.Arkadas kim) {
		super(Component.literal("Sohbet"));
		this.onceki = onceki;
		this.kim = kim;
	}

	@Override
	protected void init() {
		pw = Math.min(380, this.width - 30);
		ph = Math.min(270, this.height - 24);
		px = (this.width - pw) / 2;
		py = (this.height - ph) / 2;
		String eski = kutu != null ? kutu.getValue() : "";
		kutu = new EditBox(this.font, px + 10 + 24, py + ph - 28, pw - 20 - 62 - 24, 18, Component.literal("Mesaj"));
		kutu.setMaxLength(500);
		kutu.setHint(Component.literal("Mesaj yaz…  (Enter: gönder)"));
		kutu.setValue(eski);
		addRenderableWidget(kutu);
		gonder = addRenderableWidget(Button.builder(Component.literal("Gönder"), b -> gonder())
				.bounds(px + pw - 10 - 56, py + ph - 29, 56, 20).build());
		// Son ekran görüntüsünü bu arkadaşa gönder
		foto = addRenderableWidget(Button.builder(Component.literal("▣"), b -> {
			if (Foto.sonDosya() == null) Arkadaslar.bildir(this.minecraft, "Önce fotoğraf çek", "Oyunda F2'ye bas, sonra buradan gönder.");
			else this.minecraft.gui.setScreen(new FotoPaylasEkrani(this, Foto.sonDosya(), Foto.sonKonum()));
		}).bounds(px + 9, py + ph - 29, 20, 20).build());
		foto.setTooltip(net.minecraft.client.gui.components.Tooltip.create(Component.literal("Son ekran görüntüsünü gönder (konumuyla)")));
		geri = addRenderableWidget(Button.builder(Component.literal("‹"), b -> onClose())
				.bounds(px + 8, py + 9, 18, 18).build());
		davet = addRenderableWidget(Button.builder(Component.literal("Davet et"), b -> Arkadaslar.davetEt(this.minecraft, kim))
				.bounds(px + pw - 10 - 56, py + 8, 56, 18).build());
		katil = addRenderableWidget(Button.builder(Component.literal("Katıl"), b -> Arkadaslar.katil(this.minecraft, kim.sunucu()))
				.bounds(px + pw - 10 - 56 - 6 - 44, py + 8, 44, 18).build());
		setInitialFocus(kutu);
		Arkadaslar.acikSohbet = kim.uuid();
		Arkadaslar.okundu(kim.uuid());
		Arkadaslar.gecmisIste(this.minecraft, kim);
	}

	private void gonder() {
		String m = kutu.getValue();
		if (m.isBlank()) return;
		Arkadaslar.mesajGonder(this.minecraft, kim, m);
		kutu.setValue("");
		kaydir = 0;
	}

	@Override
	public boolean keyPressed(KeyEvent e) {
		if (e.isConfirmation() && kutu.isFocused()) {
			gonder();
			return true;
		}
		return super.keyPressed(e);
	}

	@Override
	public boolean mouseClicked(net.minecraft.client.input.MouseButtonEvent e, boolean cift) {
		for (long[] a : fotoAlanlari) {
			if (e.x() >= a[0] && e.x() < a[0] + a[2] && e.y() >= a[1] && e.y() < a[1] + a[3]) {
				this.minecraft.gui.setScreen(new FotoEkrani(this, a[4], kim.ad()));
				return true;
			}
		}
		return super.mouseClicked(e, cift);
	}

	@Override
	public boolean mouseScrolled(double x, double y, double yatay, double dikey) {
		kaydir = Math.max(0, kaydir + (int) (dikey * 20));
		return true;
	}

	@Override
	public void tick() {
		super.tick();
		// Arkadaşın durumu güncellensin
		for (var a : Arkadaslar.liste()) {
			if (a.uuid().equals(kim.uuid())) kim = a;
		}
		Arkadaslar.okundu(kim.uuid());
	}

	@Override
	public void onClose() {
		Arkadaslar.acikSohbet = null;
		this.minecraft.gui.setScreen(onceki);
	}

	@Override
	public void removed() {
		Arkadaslar.acikSohbet = null;
		super.removed();
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	private static void kutuCiz(GuiGraphicsExtractor g, int x, int y, int w, int h, int renk) {
		if (w < 3 || h < 3) {
			g.fill(x, y, x + w, y + h, renk);
			return;
		}
		g.fill(x + 1, y, x + w - 1, y + h, renk);
		g.fill(x, y + 1, x + 1, y + h - 1, renk);
		g.fill(x + w - 1, y + 1, x + w, y + h - 1, renk);
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float d) {
		Ayar a = Ayar.get();
		int zemin = Ayar.renk(a.tema.zemin, 0xFF, 0xFF232328);
		int vurgu = Ayar.renk(a.tema.vurgu, 0xFF, 0xFFA1A1AA);
		int cizgi = Ayar.ac(zemin, 0.07f);
		int yazi = 0xFFF1F5F9, soluk = 0xFF9CA3AF;
		int yesil = 0xFF4ADE80, sari = 0xFFFACC15, gri = 0xFF6B7280;

		g.fill(0, 0, this.width, this.height, 0x88000000);
		kutuCiz(g, px - 1, py - 1, pw + 2, ph + 2, Ayar.ac(zemin, 0.09f));
		kutuCiz(g, px, py, pw, ph, zemin);
		// Üst: geri, durum noktası, ad, durum
		g.fill(px + 1, py + 34, px + pw - 1, py + 35, cizgi);
		int renk = kim.oyunda() ? yesil : kim.cevrimici() ? sari : gri;
		kutuCiz(g, px + 34, py + 14, 6, 6, renk);
		g.text(this.font, kim.ad(), px + 46, py + 9, yazi, false);
		String durum = kim.oyunda() ? (kim.sunucu() != null && !kim.sunucu().isEmpty() ? "Oyunda · " + kim.sunucu() : "Oyunda")
				: kim.cevrimici() ? "Launcher açık" : Arkadaslar.cevrimdisiYazi(kim) + " · mesajı sonra görür";
		g.text(this.font, this.font.plainSubstrByWidth(durum, pw - 46 - 130), px + 46, py + 21, kim.oyunda() ? 0xFF86EFAC : soluk, false);
		// Alt çizgi
		g.fill(px + 1, py + ph - 36, px + pw - 1, py + ph - 35, cizgi);

		// Mesajlar: en alttan yukarı
		int ust = py + 40, alt = py + ph - 42;
		int maxW = (int) (pw * 0.68f);
		List<Object[]> balonlar = new ArrayList<>(); // {benden, satırlar, gidiyor, fotoId}
		for (var m : Arkadaslar.sohbet(kim.uuid())) {
			long fid = Foto.fotoId(m.metin());
			String yaziM = fid > 0 ? "Fotoğraf yükleniyor…" : m.metin();
			balonlar.add(new Object[] { m.benden(), this.font.split(Component.literal(yaziM), maxW - 12), false, fid });
		}
		for (var m : Arkadaslar.gidenler(kim.uuid())) balonlar.add(new Object[] { true, this.font.split(Component.literal(m), maxW - 12), true, -1L });
		fotoAlanlari.clear();
		g.enableScissor(px + 1, ust, px + pw - 1, alt);
		if (balonlar.isEmpty()) {
			String bos = Arkadaslar.bagli() ? "Henüz mesaj yok. İlk mesajı sen at!" : "KCZ Launcher kapalı: mesaj gönderilemez.";
			g.text(this.font, bos, px + (pw - this.font.width(bos)) / 2, (ust + alt) / 2 - 4, soluk, false);
		}
		int y = alt + kaydir;
		for (int i = balonlar.size() - 1; i >= 0 && y > ust; i--) {
			boolean ben = (boolean) balonlar.get(i)[0];
			@SuppressWarnings("unchecked")
			List<FormattedCharSequence> satirlar = (List<FormattedCharSequence>) balonlar.get(i)[1];
			boolean gidiyor = (boolean) balonlar.get(i)[2];
			long fid = (long) balonlar.get(i)[3];
			int zeminRenk = ben ? (gidiyor ? (vurgu & 0x00FFFFFF) | 0x88000000 : vurgu) : Ayar.ac(zemin, 0.10f);
			Foto.Doku dk = fid > 0 ? Foto.doku(Foto.png(fid)) : null;
			if (dk != null) {
				// Fotoğraf balonu: küçük resim, altında not; tıklayınca büyür
				Foto.Bilgi fb = Foto.bilgi(fid);
				int fw = Math.min(150, maxW), fh = Math.max(40, Math.min(110, fw * dk.h() / Math.max(1, dk.w())));
				String alt2 = fb != null && !fb.not().isEmpty() ? fb.not() : fb != null && fb.konum() != null ? "Konumlu anı · tıkla" : "Fotoğraf · tıkla";
				alt2 = this.font.plainSubstrByWidth(alt2, fw);
				int bw = fw + 8, bh = fh + 18;
				y -= bh + 4;
				int bx = ben ? px + pw - 10 - bw : px + 10;
				kutuCiz(g, bx, y, bw, bh, zeminRenk);
				Foto.ciz(g, dk, bx + 4, y + 4, fw, fh);
				g.text(this.font, alt2, bx + 4, y + fh + 7, ben ? Ayar.ustYazi(vurgu) : soluk, false);
				fotoAlanlari.add(new long[] { bx, Math.max(y, ust), bw, Math.min(y + bh, alt) - Math.max(y, ust), fid });
				continue;
			}
			int bw = 0;
			for (var s : satirlar) bw = Math.max(bw, this.font.width(s));
			bw += 12;
			int bh = satirlar.size() * 10 + 6;
			y -= bh + 4;
			int bx = ben ? px + pw - 10 - bw : px + 10;
			int yaziRenk = ben ? Ayar.ustYazi(vurgu) : yazi;
			kutuCiz(g, bx, y, bw, bh, zeminRenk);
			for (int s = 0; s < satirlar.size(); s++) g.text(this.font, satirlar.get(s), bx + 6, y + 4 + s * 10, yaziRenk, false);
		}
		g.disableScissor();
		// Kaydırma sınırı: en eski mesajın üstüne çıkmasın
		if (y > ust && kaydir > 0) kaydir = Math.max(0, kaydir - (y - ust));
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float d) {
		katil.visible = kim.oyunda() && kim.sunucu() != null && !kim.sunucu().isEmpty()
				&& !kim.sunucu().equalsIgnoreCase(Arkadaslar.sunucu(this.minecraft));
		gonder.active = !kutu.getValue().isBlank() && Arkadaslar.bagli();
		super.extractRenderState(g, mx, my, d);
	}
}
