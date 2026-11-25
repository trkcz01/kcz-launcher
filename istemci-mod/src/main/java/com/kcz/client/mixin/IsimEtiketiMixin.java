package com.kcz.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.world.entity.Entity;

import com.kcz.client.Performans;

/** Düşük sistem: uzaktaki isim etiketleri çizilmez. */
@Mixin(EntityRenderer.class)
public class IsimEtiketiMixin {
	@Inject(method = "extractNameTags(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/client/renderer/entity/state/EntityRenderState;F)V",
			at = @At("HEAD"), cancellable = true)
	private void kcz$uzakIsim(Entity e, net.minecraft.client.renderer.entity.state.EntityRenderState s, float t, CallbackInfo ci) {
		if (!Performans.isimGizle) return;
		Minecraft mc = Minecraft.getInstance();
		if (mc.player != null && e.distanceToSqr(mc.player) > Performans.ISIM_MESAFE * Performans.ISIM_MESAFE) ci.cancel();
	}
}
