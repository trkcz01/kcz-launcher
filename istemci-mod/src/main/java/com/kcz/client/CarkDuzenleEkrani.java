package com.kcz.client;

import java.util.ArrayList;
import java.util.List;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

/** Komut çarkını düzenle: solda 8 dilim, sağda seçilen dilimin adı, komutu ve simgesi. */
public class CarkDuzenleEkrani extends Screen {
	/** Seçilebilen simgeler */
	private static final String[] SIMGELER = { "minecraft:compass", "minecraft:red_bed", "minecraft:emerald", "minecraft:gold_ingot",
			"minecraft:chest", "minecraft:barrel", "minecraft:diamond_pickaxe", "minecraft:diamond_sword", "minecraft:diamond",
			"minecraft:ender_pearl", "minecraft:map", "minecraft:clock", "minecraft:writable_book", "minecraft:bell",
			"minecraft:nether_star", "minecraft:totem_of_undying", "minecraft:cake", "minecraft:golden_apple",
			"minecraft:firework_rocket", "minecraft:name_tag" };
	private static final int HUCRE = 18;

	private final Screen onceki;
	private int secili;
	private EditBox ad, komut;
	private final List<Button> dilimler = new ArrayList<>();
	private Button varsayilan;
	private long varsayilanSoruldu = 0;
	private int px, py, pw, ph, rx, rw, satirH, izgaraY, sutun;

	public CarkDuzenleEkrani(Screen onceki, int secili) {
		super(Component.literal(Dil.t("Komut çarkı")));
		this.onceki = onceki;
		this.secili = Math.max(0, Math.min(Ayar.CARK_DILIM - 1, secili));
	}

	private Ayar.CarkDilim dilim() {
		return Ayar.get().cark.get(secili);
	}

	@Override
	protected void init() {
		pw = Math.min(430, this.width - 16);
		ph = Math.min(244, this.height - 12);
		px = (this.width - pw) / 2;
		py = (this.height - ph) / 2;
		rx = px + 146;
		rw = pw - 156;
		satirH = Math.max(14, Math.min(22, (ph - 32 - 34) / Ayar.CARK_DILIM));

		dilimler.clear();
		for (int i = 0; i < Ayar.CARK_DILIM; i++) {
			final int s = i;
			dilimler.add(addRenderableWidget(Button.builder(Component.empty(), b -> sec(s))
					.bounds(px + 30, py + 32 + i * satirH, 104, satirH - 2).build()));
		}

		int y = py + 32;
		ad = new EditBox(this.font, rx, y + 10, rw, 18, Component.literal(Dil.t("Ad")));
		ad.setMaxLength(24);
		ad.setHint(Component.literal(Dil.t("Ör. Market")));
		addRenderableWidget(ad);
		komut = new EditBox(this.font, rx, y + 44, rw, 18, Component.literal(Dil.t("Komut ya da mesaj")));
		komut.setMaxLength(256);
		komut.setHint(Component.literal(Dil.t("Ör. /market ya da Selam!")));
		addRenderableWidget(komut);
		alanlariDoldur();
		ad.setResponder(m -> {
			dilim().ad = m;
			etiketler();
		});
		komut.setResponder(m -> {
			dilim().komut = m;
			etiketler();
		});

		izgaraY = y + 108;
		sutun = Math.max(1, rw / HUCRE);

		int by = py + ph - 28;
		int bittiX = px + pw - 10 - 56;
		addRenderableWidget(Button.builder(Component.literal(Dil.t("Bitti")), b -> onClose()).bounds(bittiX, by, 56, 20).build());
		varsayilan = addRenderableWidget(Button.builder(Component.literal(Dil.t("Varsayılanlar")), b -> varsayilanaDon())
				.bounds(bittiX - 4 - 90, by, 90, 20).build());
		addRenderableWidget(Button.builder(Component.literal(Dil.t("Boşalt")), b -> {
			Ayar.CarkDilim d = dilim();
			d.ad = "";
			d.komut = "";
			d.simge = "";
			alanlariDoldur();
		}).bounds(bittiX - 4 - 90 - 4 - 60, by, 60, 20).build());
		etiketler();
	}

	private void sec(int s) {
		secili = s;
		alanlariDoldur();
	}

	/** Seçilen dilimin değerlerini kutulara yaz (yazarken dilimin kendisi güncellenir) */
	private void alanlariDoldur() {
		Ayar.CarkDilim d = dilim();
		String a = d.ad, k = d.komut;
		ad.setValue(a);
		komut.setValue(k);
		etiketler();
	}

	private void etiketler() {
		List<Ayar.CarkDilim> l = Ayar.get().cark;
		for (int i = 0; i < dilimler.size() && i < l.size(); i++) {
			Ayar.CarkDilim d = l.get(i);
			String ad = d.bos() ? "§8" + Dil.t("Boş") : "§f" + (d.ad.isBlank() ? d.komut.trim() : Dil.t(d.ad.trim()));
			String m = (i == secili ? "§e" : "§7") + (i + 1) + "  " + ad;
			dilimler.get(i).setMessage(Component.literal(this.font.plainSubstrByWidth(m, 96)));
		}
		if (varsayilan != null && System.currentTimeMillis() - varsayilanSoruldu > 3000) {
			varsayilan.setMessage(Component.literal(Dil.t("Varsayılanlar")));
		}
	}

	/** İki kere tıklanınca 8 dilimi varsayılana döndürür (yanlışlıkla silinmesin) */
	private void varsayilanaDon() {
		long simdi = System.currentTimeMillis();
		if (simdi - varsayilanSoruldu > 3000) {
			varsayilanSoruldu = simdi;
			varsayilan.setMessage(Component.literal(Dil.t("Emin misin?")));
			return;
		}
		varsayilanSoruldu = 0;
		Ayar.get().cark = Ayar.varsayilanCark();
		alanlariDoldur();
	}

	@Override
	public void tick() {
		super.tick();
		etiketler();
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent e, boolean cift) {
		if (e.button() == 0) {
			int i = izgaradaki(e.x(), e.y());
			if (i >= 0) {
				dilim().simge = SIMGELER[i];
				return true;
			}
		}
		return super.mouseClicked(e, cift);
	}

	private int izgaradaki(double x, double y) {
		if (x < rx || y < izgaraY + 10) return -1;
		int c = (int) ((x - rx) / HUCRE), r = (int) ((y - izgaraY - 10) / HUCRE);
		if (c >= sutun) return -1;
		int i = r * sutun + c;
		return i < SIMGELER.length ? i : -1;
	}

	@Override
	public void onClose() {
		Ayar.kaydet();
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
		g.fill(0, 0, this.width, this.height, 0x99000000);
		g.fill(px - 1, py - 1, px + pw + 1, py + ph + 1, Ayar.ac(zemin, 0.09f));
		g.fill(px, py, px + pw, py + ph, zemin);
		g.fill(px, py, px + 2, py + ph, vurgu);
		g.text(this.font, Dil.t("Komut çarkı"), px + 10, py + 9, 0xFFF1F5F9, false);
		kucuk(g, Dil.t("{tus} basılı tut, fareyle seç, bırak").replace("{tus}", KczClient.FOTO.getTranslatedKeyMessage().getString()), px + 10, py + 20, 0xFF9CA3AF);
		g.fill(px + 140, py + 30, px + 141, py + ph - 36, Ayar.ac(zemin, 0.07f));
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float d) {
		super.extractRenderState(g, mx, my, d);
		Ayar a = Ayar.get();
		int vurgu = Ayar.renk(a.tema.vurgu, 0xFF, 0xFFA1A1AA);
		List<Ayar.CarkDilim> l = a.cark;
		// Dilim simgeleri ve seçili dilimin çerçevesi
		for (int i = 0; i < l.size(); i++) {
			int y = py + 32 + i * satirH;
			if (!l.get(i).bos()) g.item(CarkEkrani.simge(l.get(i).simge), px + 10, y + (satirH - 2 - 16) / 2);
			if (i == secili) g.outline(px + 29, y - 1, 106, satirH, vurgu);
		}
		int y = py + 32;
		kucuk(g, Dil.t("Ad"), rx, y, 0xFF9CA3AF);
		kucuk(g, Dil.t("Komut ya da mesaj"), rx, y + 34, 0xFF9CA3AF);
		kucuk(g, Dil.t("/ ile başlarsa komut gider, başlamazsa sohbete yazılır."), rx, y + 66, 0xFF9CA3AF);
		kucuk(g, Dil.t("{x} {y} {z} yazarsan bulunduğun yerle değişir."), rx, y + 76, 0xFF9CA3AF);
		kucuk(g, Dil.t("Simge"), rx, izgaraY, 0xFF9CA3AF);
		String simdiki = dilim().simge;
		int ust = izgaradaki(mx, my);
		for (int i = 0; i < SIMGELER.length; i++) {
			int hx = rx + (i % sutun) * HUCRE, hy = izgaraY + 10 + (i / sutun) * HUCRE;
			g.fill(hx, hy, hx + HUCRE - 1, hy + HUCRE - 1, i == ust ? 0x33FFFFFF : 0x18FFFFFF);
			if (SIMGELER[i].equals(simdiki)) g.outline(hx - 1, hy - 1, HUCRE + 1, HUCRE + 1, vurgu);
			g.item(CarkEkrani.simge(SIMGELER[i]), hx + 1, hy + 1);
		}
	}

	private void kucuk(GuiGraphicsExtractor g, String m, int x, int y, int renk) {
		g.pose().pushMatrix();
		g.pose().translate(x, y);
		g.pose().scale(0.75f, 0.75f);
		g.text(this.font, m, 0, 0, renk, false);
		g.pose().popMatrix();
	}
}
