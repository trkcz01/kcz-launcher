package com.kcz.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.resources.Identifier;

/**
 * KCZ "Düşük sistem" ve "Güçlü sistem": oyun içi performans ve görüntü ayarları.
 *
 * Görüntü kodundaki kancalar (mixin) her karede çağrıldığı için ayarları buradaki
 * sabit alanlardan okur; bu alanlar saniyede 20 kez (her tick) güncellenir.
 * Geçici değiştirilen oyun ayarları (FPS sınırı, görüş mesafesi) asla kalıcı
 * kaydedilmez: özellik kapanınca ya da oyun kapanırken eski hâline döner.
 */
public final class Performans {
	private Performans() {
	}

	/* ---------- Kancaların okuduğu anlık durum ---------- */
	public static volatile boolean animasyonDur = false;
	public static volatile boolean uzakVarlik = false;
	public static volatile boolean parcacikSiniri = false;
	public static volatile boolean tabelaGizle = false;
	public static volatile boolean yagisAzalt = false;
	public static volatile boolean gokyuzuSade = false;
	public static volatile boolean isimGizle = false;

	/** Bu mesafeden (blok) uzaktaki yaratıklar çizilmez */
	public static final double VARLIK_MESAFE = 40;
	/** Eşya çerçevesi, zırh standı, tablo gibi süs varlıkları için */
	public static final double SUS_MESAFE = 20;
	public static final double TABELA_MESAFE = 16;
	public static final double ISIM_MESAFE = 24;
	public static final int PARCACIK_EN_COK = 1000;
	/** Yağmur/kar sütunlarının yarıçapı (oyunda varsayılan 10) */
	public static final int YAGIS_YARICAP = 3;

	/** Güçlü sistemin ekran efektleri (sırayla uygulanır) */
	public static final Identifier EFEKT_KENAR = KczClient.id("kenar");
	public static final Identifier EFEKT_KESKIN = KczClient.id("keskin");
	public static final Identifier EFEKT_RENK = KczClient.id("renk");
	public static final Identifier EFEKT_BULANIK = KczClient.id("bulanik");
	public static volatile boolean efektKenar = false;
	public static volatile boolean efektKeskin = false;
	public static volatile boolean efektRenk = false;
	public static volatile boolean efektBulanik = false;

	public static void tick(Minecraft mc) {
		Ayar a = Ayar.get();
		boolean d = a.dusukSistem;
		boolean g = a.gucluSistem && !d;
		animasyonDur = d && a.dusuk.animasyon;
		uzakVarlik = d && a.dusuk.uzakVarlik;
		parcacikSiniri = d && a.dusuk.parcacik;
		tabelaGizle = d && a.dusuk.tabela;
		yagisAzalt = d && a.dusuk.yagis;
		gokyuzuSade = d && a.dusuk.gokyuzu;
		isimGizle = d && a.dusuk.isimEtiketi;
		efektKenar = g && a.guclu.kenar;
		efektKeskin = g && a.guclu.keskin;
		efektRenk = g && a.guclu.renk;
		efektBulanik = g && a.guclu.bulaniklik;

		fpsSiniri(mc, a);
		dinamikGorus(mc, d && a.dusuk.dinamikGorus, a);
	}

	/** Oyun kapanırken: geçici değerleri geri al */
	public static void geriAl(Minecraft mc) {
		fpsGeriAl(mc);
		gorusGeriAl(mc);
	}

	/* =========================================================
	   FPS sınırı: arkadayken 15, menüdeyken 30, güçlü sistemde ekranın Hz'i.
	   Oyunun FPS ayarına HİÇ yazılmaz: oyunun sınır hesaplayıcısının sonucu
	   (FpsSiniriMixin) anlık olarak değiştirilir. Böylece geçici değerler
	   options.txt'ye kaydedilip kalıcı düşük FPS'e yol açmaz.
	   ========================================================= */
	private static final int ARKA_PLAN_FPS = 15;
	private static final int MENU_FPS = 30;
	/** 0 = sınır yok; menüdeyken 30 */
	public static volatile int menuSiniri = 0;
	/** 0 = yok; güçlü sistemde ya da akıllı FPS'te ekranın Hz'i (pil modunda en çok 60) */
	public static volatile int hzHedef = 0;
	/** 0 = yok; akıllı FPS açıkken AFK'de 30 */
	public static volatile int afkSiniri = 0;
	private static final int AKILLI_MENU_FPS = 60;
	private static final int AFK_FPS = 30;
	private static final long AFK_MS = 90_000L;
	private static double afkX, afkY, afkZ;
	private static float afkYon, afkBakis;
	private static long sonHareket = System.currentTimeMillis();

	private static void fpsSiniri(Minecraft mc, Ayar a) {
		try {
			Screen ekran = mc.gui.screen();
			boolean dunyada = mc.level != null && mc.player != null;
			boolean menude = dunyada && ekran != null
					&& (ekran instanceof PauseScreen || ekran instanceof KczEkrani || ekran instanceof SistemEkrani || mc.isPaused());
			boolean akilli = !"kapali".equals(a.akilliFps);
			// Oyunu örten ekranlar (envanter, ayarlar, Esc); sohbet oyunu örtmez, kısılmaz
			boolean ortulu = dunyada && ekran != null && !(ekran instanceof ChatScreen);
			int menu = 0;
			if (a.dusukSistem && a.dusuk.menuFps && menude) menu = MENU_FPS;
			else if (akilli && ortulu) menu = AKILLI_MENU_FPS;
			menuSiniri = menu;
			// AFK: 90 saniye ne bakış ne konum değişti
			long simdi = System.currentTimeMillis();
			if (dunyada) {
				var p = mc.player;
				if (ekran != null || Math.abs(p.getX() - afkX) > 0.05 || Math.abs(p.getY() - afkY) > 0.05 || Math.abs(p.getZ() - afkZ) > 0.05
						|| Math.abs(p.getYRot() - afkYon) > 0.5f || Math.abs(p.getXRot() - afkBakis) > 0.5f) {
					sonHareket = simdi;
					afkX = p.getX();
					afkY = p.getY();
					afkZ = p.getZ();
					afkYon = p.getYRot();
					afkBakis = p.getXRot();
				}
			} else {
				sonHareket = simdi;
			}
			afkSiniri = akilli && dunyada && ekran == null && simdi - sonHareket > AFK_MS ? AFK_FPS : 0;
			int hz = 0;
			if (a.gucluSistem && !a.dusukSistem && a.guclu.hzFps) hz = ekranHz(mc);
			if ("hz".equals(a.akilliFps)) hz = ekranHz(mc);
			else if ("pil".equals(a.akilliFps)) hz = Math.min(ekranHz(mc), 60);
			hzHedef = hz;
		} catch (Throwable t) {
			KczClient.LOG.debug("FPS sınırı: {}", t.toString());
		}
	}

	/** Oyunun hesapladığı FPS sınırını ayarlara göre düzeltir (her karede çağrılır, çok hafif). */
	public static int sinirDuzelt(int oyununki) {
		Minecraft mc = Minecraft.getInstance();
		Ayar a = Ayar.get();
		// Pencere arkadayken: anında 15 (geri dönünce aynı karede kalkar)
		if (a.arkaplanFps && !mc.isWindowActive()) return Math.min(oyununki, ARKA_PLAN_FPS);
		int s = oyununki;
		if (menuSiniri > 0) s = Math.min(s, menuSiniri);
		if (afkSiniri > 0) s = Math.min(s, afkSiniri);
		// Ekranın Hz'i: oyun kendisi kısmıyorsa; oyuncunun kendi sınırını geçmez (260 = sınırsız)
		if (hzHedef > 0 && oyununki == mc.options.framerateLimit().get()) s = Math.min(s, oyununki >= 260 ? hzHedef : Math.min(oyununki, hzHedef));
		return s;
	}

	/** Eskiden çağrılıyordu; artık FPS ayarı değiştirilmediği için boş */
	public static void kareBasi(Minecraft mc) {
	}

	private static void fpsGeriAl(Minecraft mc) {
		menuSiniri = 0;
		hzHedef = 0;
		afkSiniri = 0;
	}

	/** Ekranın yenileme hızı (bulunamazsa 60). Oyunun en yüksek sınırı 260 (= sınırsız). */
	public static int ekranHz(Minecraft mc) {
		try {
			// 26.2'de tam sayı, 26.3'te ondalıklı: ikisi de double'a çevrilir
			double hz = mc.getWindow().findBestMonitor().currentMode().getRefreshRate();
			if (hz >= 30) return (int) Math.min(260, Math.round(hz));
		} catch (Throwable ignored) {
		}
		return 60;
	}

	/* =========================================================
	   Dinamik görüş mesafesi: FPS uzun süre hedefin altındaysa bir kademe
	   kısılır, toparlanınca geri gelir. Oyuncunun kendi ayarını geçmez.
	   ========================================================= */
	private static Integer asilGorus = null;
	private static Integer verilenGorus = null;
	private static int dusukSaniye = 0, iyiSaniye = 0;
	private static long sonKontrol = 0L;

	private static void dinamikGorus(Minecraft mc, boolean acik, Ayar a) {
		try {
			if (!acik || mc.level == null) {
				gorusGeriAl(mc);
				return;
			}
			long simdi = System.nanoTime();
			if (simdi - sonKontrol < 1_000_000_000L) return;
			sonKontrol = simdi;
			// Menüde ya da arkadayken FPS bilerek düşük: ölçme
			if (mc.gui.screen() != null || !mc.isWindowActive()) {
				dusukSaniye = iyiSaniye = 0;
				return;
			}
			int gorus = mc.options.renderDistance().get();
			// Oyuncu görüşü kendisi değiştirdiyse yeni esas o
			if (verilenGorus != null && gorus != verilenGorus) {
				asilGorus = gorus;
				verilenGorus = null;
			}
			if (asilGorus == null) asilGorus = gorus;
			int fps = Hud.sonFps();
			int hedef = a.hedefFps;
			if (fps > 0 && fps < hedef * 0.85) {
				dusukSaniye++;
				iyiSaniye = 0;
			} else if (fps > hedef * 1.25) {
				iyiSaniye++;
				dusukSaniye = 0;
			} else {
				dusukSaniye = Math.max(0, dusukSaniye - 1);
				iyiSaniye = Math.max(0, iyiSaniye - 1);
			}
			int alt = Math.min(a.dusuk.gorusAlt, asilGorus);
			if (dusukSaniye >= 8 && gorus > alt) {
				gorusAyarla(mc, gorus - 1);
				dusukSaniye = 0;
			} else if (iyiSaniye >= 20 && gorus < asilGorus) {
				gorusAyarla(mc, gorus + 1);
				iyiSaniye = 0;
			}
		} catch (Throwable t) {
			KczClient.LOG.debug("Dinamik görüş: {}", t.toString());
		}
	}

	private static void gorusAyarla(Minecraft mc, int deger) {
		verilenGorus = deger;
		mc.options.renderDistance().set(deger);
		KczClient.LOG.info("KCZ dinamik görüş: {} parça", deger);
	}

	private static void gorusGeriAl(Minecraft mc) {
		if (asilGorus != null) {
			try {
				if (verilenGorus != null && mc.options.renderDistance().get().equals(verilenGorus)) {
					mc.options.renderDistance().set(asilGorus);
				}
			} catch (Throwable ignored) {
			}
		}
		asilGorus = null;
		verilenGorus = null;
		dusukSaniye = iyiSaniye = 0;
	}

	/** Oyuncu ayarları kaydederken geçici görüş yerine kendi değeri yazılsın diye */
	public static Integer asilGorus() {
		return asilGorus;
	}

}
