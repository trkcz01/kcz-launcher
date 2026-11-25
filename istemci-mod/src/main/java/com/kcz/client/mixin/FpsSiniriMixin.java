package com.kcz.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

import com.kcz.client.Performans;
import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import com.mojang.blaze3d.platform.FramerateLimitTracker;

/** KCZ FPS sınırları (arka plan, menü, ekran Hz'i) oyunun FPS ayarına yazılmadan uygulanır. */
@Mixin(FramerateLimitTracker.class)
public class FpsSiniriMixin {
	@ModifyReturnValue(method = "getFramerateLimit", at = @At("RETURN"))
	private int kcz$fpsSiniri(int sinir) {
		return Performans.sinirDuzelt(sinir);
	}
}
