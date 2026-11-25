package com.kcz.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;

/**
 * Koşmayı açık tut: ileri giderken Ctrl'e basmadan koşar (açlık, eğilme, eşya kullanma gibi
 * koşulamayan durumlarda koşmaz). Eğilmeyi açık tut: oyunun kendi "eğilme: aç/kapa" ayarı.
 */
public final class Hareket {
	private Hareket() {
	}

	private static Boolean sonEgilme = null;

	public static void tick(Minecraft mc) {
		Ayar a = Ayar.get();
		// Eğilme: oyunun kendi ayarı (değişmedikçe dokunulmaz)
		if (sonEgilme == null || sonEgilme != a.egilmeTut) {
			try {
				mc.options.toggleCrouch().set(a.egilmeTut);
				sonEgilme = a.egilmeTut;
			} catch (Throwable ignored) {
			}
		}
		if (!a.surekliKos) return;
		LocalPlayer p = mc.player;
		if (p == null || mc.gui.screen() != null) return;
		boolean ileri = mc.options.keyUp.isDown();
		if (ileri && !p.isSprinting() && !p.isShiftKeyDown() && !p.isUsingItem()
				&& (p.getAbilities().mayfly || p.getFoodData().getFoodLevel() > 6)
				&& !p.horizontalCollision) {
			p.setSprinting(true);
		}
	}
}
