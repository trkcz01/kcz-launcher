package com.kcz.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import net.minecraft.client.renderer.blockentity.BlockEntityRenderDispatcher;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.SignBlockEntity;
import net.minecraft.world.phys.Vec3;

import com.kcz.client.Performans;

/** Düşük sistem: uzaktaki tabelaların yazıları çizilmez (kalabalık lobilerde çok FPS yer). */
@Mixin(BlockEntityRenderDispatcher.class)
public class TabelaMixin {
	@Shadow private Vec3 cameraPos;

	@Inject(method = "tryExtractRenderState", at = @At("HEAD"), cancellable = true)
	private void kcz$uzakTabela(BlockEntity be, float t, net.minecraft.client.renderer.feature.ModelFeatureRenderer.CrumblingOverlay k,
			boolean b, CallbackInfoReturnable<net.minecraft.client.renderer.blockentity.state.BlockEntityRenderState> cir) {
		if (!Performans.tabelaGizle || cameraPos == null || !(be instanceof SignBlockEntity)) return;
		if (cameraPos.distanceToSqr(be.getBlockPos().getX() + 0.5, be.getBlockPos().getY() + 0.5, be.getBlockPos().getZ() + 0.5) > Performans.TABELA_MESAFE * Performans.TABELA_MESAFE) {
			cir.setReturnValue(null);
		}
	}
}
