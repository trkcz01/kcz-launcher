package com.kcz.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import net.minecraft.client.renderer.GameRenderer;

import com.kcz.client.KczClient;

/** Zoom yaparken eldeki eşya ve yürürken kafa sallanması gizlenir (yakınlaşınca titremesin). */
@Mixin(GameRenderer.class)
public class ZoomGameRendererMixin {
	@Inject(method = "renderItemInHand", at = @At("HEAD"), cancellable = true)
	private void kcz$zoomdaElYok(CallbackInfo ci) {
		if (KczClient.zoomGorunuyor()) ci.cancel();
	}

	@Inject(method = "bobView", at = @At("HEAD"), cancellable = true)
	private void kcz$zoomdaSallanmaYok(CallbackInfo ci) {
		if (KczClient.zoomGorunuyor()) ci.cancel();
	}
}
