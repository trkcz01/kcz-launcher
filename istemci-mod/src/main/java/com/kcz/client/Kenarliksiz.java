package com.kcz.client;

import java.lang.reflect.Method;

import net.minecraft.client.Minecraft;

/**
 * Kenarlıksız tam ekran: Minecraft tam ekrana geçince (F11) ekranı "özel" moda almak yerine
 * pencereyi ekran boyutunda, çerçevesiz yapar. Böylece Alt-Tab'da ekran modu değişmez,
 * kararma ve donma olmaz.
 *
 * Pencere kütüphanesi (GLFW) her Minecraft sürümünde bulunmadığı için doğrudan değil,
 * çalışırken aranarak kullanılır. Bulunamazsa bu özellik sessizce devre dışı kalır.
 */
public final class Kenarliksiz {
	private Kenarliksiz() {
	}

	private static final int DECORATED = 0x00020005;
	private static final int TRUE = 1, FALSE = 0, DONT_CARE = -1;

	private static boolean hazir = false, yok = false;
	private static Method baglam, pencereMonitoru, videoModu, monitorKonumu, ozellik, monitorAyarla, birincilMonitor;
	private static Method modGenislik, modYukseklik, modYenileme;

	private static boolean hazirla() {
		if (hazir) return true;
		if (yok) return false;
		try {
			Class<?> g = Class.forName("org.lwjgl.glfw.GLFW");
			baglam = g.getMethod("glfwGetCurrentContext");
			pencereMonitoru = g.getMethod("glfwGetWindowMonitor", long.class);
			videoModu = g.getMethod("glfwGetVideoMode", long.class);
			monitorKonumu = g.getMethod("glfwGetMonitorPos", long.class, int[].class, int[].class);
			ozellik = g.getMethod("glfwSetWindowAttrib", long.class, int.class, int.class);
			monitorAyarla = g.getMethod("glfwSetWindowMonitor", long.class, long.class, int.class, int.class, int.class, int.class, int.class);
			birincilMonitor = g.getMethod("glfwGetPrimaryMonitor");
			Class<?> m = Class.forName("org.lwjgl.glfw.GLFWVidMode");
			modGenislik = m.getMethod("width");
			modYukseklik = m.getMethod("height");
			modYenileme = m.getMethod("refreshRate");
			hazir = true;
		} catch (Throwable t) {
			yok = true;
			KczClient.LOG.info("Kenarlıksız tam ekran bu sürümde kullanılamıyor.");
		}
		return hazir;
	}

	/* 26.3 ve sonrası: oyunun kendi "özel tam ekran" ayarı var; kenarlıksız = o ayar kapalı */
	private static Method ozelTamEkran;
	private static boolean ozelDenendi = false;

	private static Method ozelAyar() {
		if (!ozelDenendi) {
			ozelDenendi = true;
			try {
				ozelTamEkran = net.minecraft.client.Options.class.getMethod("exclusiveFullscreen");
			} catch (Throwable ignored) {
				ozelTamEkran = null;
			}
		}
		return ozelTamEkran;
	}

	/** Bu Minecraft sürümünde çalışabiliyor mu (menüde göstermek için) */
	public static boolean destekleniyor() {
		return ozelAyar() != null || hazirla();
	}

	/** Özel tam ekranın monitörü (geri dönmek gerekirse) */
	private static long monitor = 0L;
	/** Pencereyi biz çerçevesiz tam ekran yaptık mı */
	private static boolean bizde = false;

	/** Her tikte (ana iş parçacığında) çağrılır. Bir şey değişmedikçe sadece birkaç denetim yapar. */
	@SuppressWarnings("unchecked")
	public static void tick(Minecraft mc) {
		Method ozel = ozelAyar();
		if (ozel != null) {
			try {
				net.minecraft.client.OptionInstance<Boolean> o = (net.minecraft.client.OptionInstance<Boolean>) ozel.invoke(mc.options);
				boolean istenen = !Ayar.get().kenarliksiz;
				if (o.get() != istenen) o.set(istenen);
			} catch (Throwable t) {
				KczClient.LOG.debug("Özel tam ekran: {}", t.toString());
			}
			return;
		}
		if (!hazirla()) return;
		try {
			long pencere = (long) baglam.invoke(null);
			if (pencere == 0L) return;
			boolean tamEkranIstendi = mc.options.fullscreen().get();
			long ozelMonitor = (long) pencereMonitoru.invoke(null, pencere);
			boolean acik = Ayar.get().kenarliksiz;

			if (acik && tamEkranIstendi && ozelMonitor != 0L) {
				// Oyun özel tam ekrana geçti: aynı monitörde çerçevesiz pencereye çevir
				Object mod = videoModu.invoke(null, ozelMonitor);
				if (mod == null) return;
				int[] x = new int[1];
				int[] y = new int[1];
				monitorKonumu.invoke(null, ozelMonitor, x, y);
				monitor = ozelMonitor;
				ozellik.invoke(null, pencere, DECORATED, FALSE);
				monitorAyarla.invoke(null, pencere, 0L, x[0], y[0], (int) modGenislik.invoke(mod), (int) modYukseklik.invoke(mod), DONT_CARE);
				bizde = true;
			} else if (bizde && !tamEkranIstendi) {
				// Oyuncu tam ekrandan çıktı (F11): çerçeveyi geri getir; boyutu oyun kendisi ayarlar
				ozellik.invoke(null, pencere, DECORATED, TRUE);
				bizde = false;
			} else if (bizde && !acik && tamEkranIstendi) {
				// Ayar kapatıldı: normal (özel) tam ekrana geri dön
				ozellik.invoke(null, pencere, DECORATED, TRUE);
				long m = monitor != 0L ? monitor : (long) birincilMonitor.invoke(null);
				Object mod = videoModu.invoke(null, m);
				if (mod != null) {
					monitorAyarla.invoke(null, pencere, m, 0, 0, (int) modGenislik.invoke(mod), (int) modYukseklik.invoke(mod), (int) modYenileme.invoke(mod));
				}
				bizde = false;
			}
		} catch (Throwable t) {
			KczClient.LOG.debug("Kenarlıksız tam ekran: {}", t.toString());
		}
	}
}
