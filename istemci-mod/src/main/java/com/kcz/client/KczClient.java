package com.kcz.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.mojang.blaze3d.platform.InputConstants;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import net.minecraft.client.Minecraft;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.fabricmc.fabric.api.event.player.UseEntityCallback;

public class KczClient implements ClientModInitializer {
	public static final String ID = "kcz-client";
	public static final Logger LOG = LoggerFactory.getLogger("KCZ Client");

	public static Identifier id(String yol) {
		return Identifier.fromNamespaceAndPath(ID, yol);
	}

	private static final KeyMapping.Category KATEGORI = KeyMapping.Category.register(id("kategori"));
	// Menü ESC ekranındaki KCZ düğmesiyle açılır; istersen Kontroller'den bir tuş da atanabilir (varsayılan: yok)
	public static final KeyMapping MENU = new KeyMapping("key.kcz-client.menu", InputConstants.UNKNOWN.getValue(), KATEGORI);
	public static final KeyMapping ZOOM = new KeyMapping("key.kcz-client.zoom", InputConstants.KEY_C, KATEGORI);
	/** KCZ yakınlık sesli sohbeti: basılı tutunca konuşursun */
	// Konumlu anı: F2'den sonra son fotoğrafı arkadaşa gönder
	public static final KeyMapping FOTO = new KeyMapping("key.kcz-client.foto", InputConstants.KEY_G, KATEGORI);
	public static final KeyMapping KONUS = new KeyMapping("key.kcz-client.konus", InputConstants.KEY_B, KATEGORI);

	private static volatile boolean zoomda = false;
	private static float zoomDegeri = 1f;
	private static long sonZaman = 0L;
	// Tekerlekle ayarlanan ek çarpan: her yeni zoomda ayardaki güçten başlar
	private static float tekerlekCarpani = 1f;
	private static final float EN_AZ_ZOOM = 1.5f;
	private static final float EN_COK_ZOOM = 128f;

	@Override
	public void onInitializeClient() {
		Ayar.yukle();
		KeyMappingHelper.registerKeyMapping(MENU);
		KeyMappingHelper.registerKeyMapping(ZOOM);
		KeyMappingHelper.registerKeyMapping(KONUS);
		KeyMappingHelper.registerKeyMapping(FOTO);
		HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT, id("hud"), Hud::ciz);
		HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT, id("ses"), Ses::ciz);
		HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT, id("foto"), Foto::ciz);
		HudElementRegistry.replaceElement(VanillaHudElements.CROSSHAIR, Nisangah::sar);

		// KÇZ kullanan birine eğilip eli boşken sağ tık: KÇZ menüsü (arkadaş ekle, mesaj)
		UseEntityCallback.EVENT.register((oyuncu, dunya, el, varlik, isabet) -> KczOyunculari.sagTik(oyuncu, dunya, el, varlik));

		// ESC (duraklatma) ekranının sol üstüne KCZ düğmesi
		ScreenEvents.AFTER_INIT.register((mc, ekran, genislik, yukseklik) -> {
			// Ana menü ve Esc menüsünün sağ üstü: hesap değiştir / ekle
			if (ekran instanceof TitleScreen || ekran instanceof PauseScreen) {
				String hesap = "Hesap: " + mc.getUser().getName();
				int w = Math.min(170, mc.font.width(hesap) + 16);
				Screens.getWidgets(ekran).add(Button.builder(Component.literal(hesap), b -> mc.gui.setScreen(new HesapEkrani(ekran)))
						.bounds(genislik - w - 6, 6, w, 20)
						.build());
			}
			if (ekran instanceof PauseScreen) {
				Screens.getWidgets(ekran).add(Button.builder(Component.literal("KCZ Menü"), b -> mc.gui.setScreen(KczEkrani.sekmeyle(ekran, false)))
						.bounds(6, 6, 80, 20)
						.build());
				// Arkadaşlar: gelen davet varsa sayısı, yoksa çevrimiçi arkadaş sayısı
				int davet = Arkadaslar.davetler().size();
				long acik = Arkadaslar.liste().stream().filter(x -> x.cevrimici() || x.oyunda()).count();
				int mesaj = Arkadaslar.okunmamisToplam();
				String yazi = mesaj > 0 ? "Arkadaşlar · " + mesaj + " mesaj" : davet > 0 ? "Arkadaşlar · " + davet + " davet"
						: acik > 0 ? "Arkadaşlar · " + acik : "Arkadaşlar";
				Screens.getWidgets(ekran).add(Button.builder(Component.literal(yazi), b -> mc.gui.setScreen(KczEkrani.sekmeyle(ekran, true)))
						.bounds(90, 6, Math.max(80, mc.font.width(yazi) + 16), 20)
						.build());
			}
		});

		ClientTickEvents.END_CLIENT_TICK.register(mc -> {
			while (MENU.consumeClick()) {
				if (mc.gui.screen() == null) {
					mc.gui.setScreen(new KczEkrani(null));
				}
			}
			boolean simdi = Ayar.get().zoom && mc.player != null && mc.gui.screen() == null && ZOOM.isDown();
			if (!simdi) {
				tekerlekCarpani = 1f;
			}
			zoomda = simdi;
			Performans.tick(mc);
			Kenarliksiz.tick(mc);
			Hareket.tick(mc);
			Arkadaslar.tick(mc);
			Hesaplar.tick(mc);
			KczOyunculari.tick(mc);
			Ses.tick(mc);
			Foto.tick(mc);
		});
		// Oyun kapanırken FPS ve görüş ayarlarını eski hâline getir (geçici değerler kaydedilmesin)
		ClientLifecycleEvents.CLIENT_STOPPING.register(Performans::geriAl);
		LOG.info("KCZ Client hazır.");
	}

	public static boolean zoomdaMi() {
		return zoomda;
	}

	/** Şu anki (yumuşatılmış) zoom katı */
	public static float anlikZoom() {
		return Math.max(1f, zoomDegeri);
	}

	/** C'ye basınca ilk yakınlaşma; ayardaki en fazla değeri geçmez */
	private static float baslangic() {
		Ayar a = Ayar.get();
		return Math.min(a.zoomBaslangic, Math.max(EN_AZ_ZOOM, a.zoomKat));
	}

	private static float hedefZoom() {
		float enCok = Math.max(EN_AZ_ZOOM, Math.min(EN_COK_ZOOM, Ayar.get().zoomKat));
		return Math.max(EN_AZ_ZOOM, Math.min(enCok, baslangic() * tekerlekCarpani));
	}

	/** Tekerlek: yukarı yakınlaştırır, aşağı uzaklaştırır (her adım %25). Üst sınır ayardaki "en fazla zoom". */
	public static void tekerlek(int adim) {
		float yeni = tekerlekCarpani * (float) Math.pow(1.25, adim);
		float b = baslangic();
		float enCok = Math.max(EN_AZ_ZOOM, Math.min(EN_COK_ZOOM, Ayar.get().zoomKat));
		tekerlekCarpani = Math.max(EN_AZ_ZOOM / b, Math.min(enCok / b, yeni));
	}

	// Zoom bir "yay" gibi hareket eder: hızlanarak başlar, yavaşlayarak durur, hedefi aşmaz.
	// Logaritmik ölçekte çalışır: 2x→4x ile 32x→64x aynı hızda ve aynı yumuşaklıkta geçer.
	private static double logZoom = 0.0, logHiz = 0.0;
	private static final double YAY = 11.0;

	/** Kameranın görüş açısı bu sayıya bölünür (1 = zoom yok). Kare hızından bağımsız yumuşak geçiş. */
	public static float zoomBoleni() {
		long simdi = System.nanoTime();
		double dt = sonZaman == 0L ? 0.0 : Math.min((simdi - sonZaman) / 1.0e9, 0.1);
		sonZaman = simdi;
		double hedef = Math.log(zoomda ? hedefZoom() : 1f);
		// Küçük adımlarla ilerle: düşük FPS'te de aynı yumuşaklık
		while (dt > 0) {
			double h = Math.min(dt, 1.0 / 240.0);
			double ivme = -2.0 * YAY * logHiz - YAY * YAY * (logZoom - hedef);
			logHiz += ivme * h;
			logZoom += logHiz * h;
			dt -= h;
		}
		if (Math.abs(logZoom - hedef) < 0.0005 && Math.abs(logHiz) < 0.001) {
			logZoom = hedef;
			logHiz = 0.0;
		}
		zoomDegeri = (float) Math.exp(logZoom);
		return Math.max(1f, zoomDegeri);
	}

	/** Zoom yaparken fare hızı: görüş daraldıkça yavaşlar (128x'te de kontrol edilebilir kalsın) */
	public static double fareBoleni() {
		float z = anlikZoom();
		return z <= 4f ? Math.sqrt(z) : 2.0 * Math.pow(z / 4.0, 0.85);
	}

	/** Zoom görünüyor mu? (el ve kafa sallanması gizlenir) */
	public static boolean zoomGorunuyor() {
		return zoomDegeri > 1.03f;
	}
}
