package com.kcz.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;

import net.minecraft.client.renderer.WeatherEffectRenderer;

import com.kcz.client.Performans;

/** Düşük sistem: yağmur ve kar daha küçük bir alanda çizilir. */
@Mixin(WeatherEffectRenderer.class)
public class YagisMixin {
	@ModifyExpressionValue(method = "extractRenderState", at = @At(value = "INVOKE",
			target = "Lnet/minecraft/client/OptionInstance;get()Ljava/lang/Object;", ordinal = 0))
	private Object kcz$yagisAzalt(Object deger) {
		if (Performans.yagisAzalt && deger instanceof Integer r) {
			return Math.min(r, Performans.YAGIS_YARICAP);
		}
		return deger;
	}
}
