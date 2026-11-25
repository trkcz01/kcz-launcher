package com.kcz.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;

import net.minecraft.client.Camera;

import com.kcz.client.KczClient;

/** Zoom: kameranın görüş açısını (FOV) basılı tutarken daraltır. */
@Mixin(Camera.class)
public class CameraMixin {
	@ModifyReturnValue(method = "calculateFov", at = @At("RETURN"))
	private float kcz$zoom(float fov) {
		return fov / KczClient.zoomBoleni();
	}
}
