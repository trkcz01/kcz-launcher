package com.kcz.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import net.minecraft.client.renderer.SkyRenderer;

import com.kcz.client.Performans;

/** Düşük sistem: yıldızlar ve gün doğumu/batımı renkleri çizilmez. Güneş ve ay kalır. */
@Mixin(SkyRenderer.class)
public class GokyuzuMixin {
	@Inject(method = "renderStars", at = @At("HEAD"), cancellable = true)
	private void kcz$yildizYok(CallbackInfo ci) {
		if (Performans.gokyuzuSade) ci.cancel();
	}

	@Inject(method = "renderSunriseAndSunset", at = @At("HEAD"), cancellable = true)
	private void kcz$gunBatimiYok(CallbackInfo ci) {
		if (Performans.gokyuzuSade) ci.cancel();
	}
}
