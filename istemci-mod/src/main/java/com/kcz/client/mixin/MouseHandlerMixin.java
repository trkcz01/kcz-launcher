package com.kcz.client.mixin;

import org.joml.Vector2i;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import com.llamalad7.mixinextras.sugar.Local;

import net.minecraft.client.MouseHandler;
import net.minecraft.client.input.MouseButtonInfo;
import org.spongepowered.asm.mixin.Shadow;

import com.kcz.client.CarkEkrani;

import com.kcz.client.KczClient;

/** Zoom yaparken: tekerlek yakınlaştırır/uzaklaştırır (eşya çubuğu kaymaz), fare hassasiyeti zooma göre azalır. */
@Mixin(MouseHandler.class)
public class MouseHandlerMixin {
	@Shadow
	private double accumulatedDX;
	@Shadow
	private double accumulatedDY;

	/** Komut çarkı açıkken fare kamerayı çevirmez, çarkta yön seçer (yürümek serbest) */
	@Inject(method = "turnPlayer", at = @At("HEAD"), cancellable = true)
	private void kcz$carkFare(double sure, CallbackInfo ci) {
		if (CarkEkrani.acikMi()) {
			CarkEkrani.fare(accumulatedDX, accumulatedDY);
			accumulatedDX = 0;
			accumulatedDY = 0;
			ci.cancel();
		}
	}

	/** Komut çarkı açıkken sol tık seçer, sağ tık düzenler (saldırma/koyma olmaz) */
	@Inject(method = "onButton", at = @At("HEAD"), cancellable = true)
	private void kcz$carkTik(long pencere, MouseButtonInfo bilgi, int eylem, CallbackInfo ci) {
		if (CarkEkrani.acikMi() && CarkEkrani.tikla(bilgi.button(), eylem)) {
			ci.cancel();
		}
	}

	@Inject(method = "onScroll", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/player/LocalPlayer;isSpectator()Z"), cancellable = true)
	private void kcz$tekerlekZoom(CallbackInfo ci, @Local Vector2i kaydirma) {
		if (CarkEkrani.acikMi()) {
			ci.cancel();
			return;
		}
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
