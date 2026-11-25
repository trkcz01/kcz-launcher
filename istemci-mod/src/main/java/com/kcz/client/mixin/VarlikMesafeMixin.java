package com.kcz.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import com.llamalad7.mixinextras.sugar.Local;

import net.minecraft.client.renderer.entity.EntityRenderDispatcher;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.entity.decoration.HangingEntity;
import net.minecraft.world.entity.player.Player;

import com.kcz.client.Performans;

/**
 * Düşük sistem: uzaktaki yaratıklar çizilmez; eşya çerçevesi, tablo ve zırh standı daha yakından gizlenir.
 * Oyuncular her zaman çizilir (sunucuda haksızlık olmasın).
 */
@Mixin(EntityRenderDispatcher.class)
public class VarlikMesafeMixin {
	// 26.2: shouldRender(E, Frustum, x, y, z) · 26.3: sonuna float eklendi. Argümanlar türüne göre alınır.
	@Inject(method = "shouldRender", at = @At("HEAD"), cancellable = true)
	private void kcz$uzakVarlik(CallbackInfoReturnable<Boolean> cir, @Local(argsOnly = true) Entity e,
			@Local(argsOnly = true, ordinal = 0) double x, @Local(argsOnly = true, ordinal = 1) double y,
			@Local(argsOnly = true, ordinal = 2) double z) {
		if (!Performans.uzakVarlik || e instanceof Player || e.hasPassenger(p -> p instanceof Player)) return;
		double sinir = (e instanceof HangingEntity || e instanceof ArmorStand) ? Performans.SUS_MESAFE : Performans.VARLIK_MESAFE;
		if (e.distanceToSqr(x, y, z) > sinir * sinir) cir.setReturnValue(false);
	}
}
