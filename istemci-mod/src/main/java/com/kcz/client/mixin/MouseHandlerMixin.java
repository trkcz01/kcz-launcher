package com.kcz.client.mixin;

import org.joml.Vector2i;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import com.llamalad7.mixinextras.sugar.Local;

import net.minecraft.client.MouseHandler;

import com.kcz.client.KczClient;

/** Zoom yaparken: tekerlek yakınlaştırır/uzaklaştırır (eşya çubuğu kaymaz), fare hassasiyeti zooma göre azalır. */
@Mixin(MouseHandler.class)
public class MouseHandlerMixin {
	@Inject(method = "onScroll", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/player/LocalPlayer;isSpectator()Z"), cancellable = true)
	private void kcz$tekerlekZoom(CallbackInfo ci, @Local Vector2i kaydirma) {
		int adim = kaydirma.y + kaydirma.x;
		if (adim != 0 && KczClient.zoomdaMi()) {
			KczClient.tekerlek(adim);
			ci.cancel();
		}
	}

	@ModifyExpressionValue(method = "turnPlayer", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/OptionInstance;get()Ljava/lang/Object;", ordinal = 0))
	private Object kcz$hassasiyet(Object deger) {
		if (deger instanceof Double d && KczClient.zoomdaMi()) {
			return d / KczClient.fareBoleni();
		}
		return deger;
	}
}
