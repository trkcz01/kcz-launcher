package com.kcz.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import com.kcz.client.Olcum;

import net.minecraft.client.renderer.GameRenderer;

/** Her karenin başı: performans ölçümü (26.2'de render(DeltaTracker, boolean), 26.3'te render(): sadece ad ile) */
@Mixin(GameRenderer.class)
public class KareOlcumMixin {
	@Inject(method = "render", at = @At("HEAD"))
	private void kcz$kare(CallbackInfo ci) {
		Olcum.kare();
	}
}
