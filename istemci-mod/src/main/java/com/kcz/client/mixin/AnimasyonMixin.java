package com.kcz.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import net.minecraft.client.renderer.texture.TextureAtlas;

import com.kcz.client.Performans;

/** Düşük sistem: su, lav, ateş gibi hareketli dokular durur (her karede doku yükleme yükü kalkar). */
@Mixin(TextureAtlas.class)
public class AnimasyonMixin {
	@Inject(method = "cycleAnimationFrames", at = @At("HEAD"), cancellable = true)
	private void kcz$animasyonDur(CallbackInfo ci) {
		if (Performans.animasyonDur) ci.cancel();
	}
}
