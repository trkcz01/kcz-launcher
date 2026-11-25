package com.kcz.client.mixin;

import java.util.Map;
import java.util.Queue;

import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import net.minecraft.client.particle.Particle;
import net.minecraft.client.particle.ParticleEngine;
import net.minecraft.client.particle.ParticleGroup;
import net.minecraft.client.particle.ParticleRenderType;

import com.kcz.client.Performans;

/** Düşük sistem: ekrandaki parçacık sayısına üst sınır (patlama, yağmur sıçraması, büyü...). */
@Mixin(ParticleEngine.class)
public class ParcacikMixin {
	@Shadow @Final private Map<ParticleRenderType, ParticleGroup<?>> particles;
	@Shadow @Final private Queue<Particle> particlesToAdd;

	@Inject(method = "add", at = @At("HEAD"), cancellable = true)
	private void kcz$parcacikSiniri(Particle p, CallbackInfo ci) {
		if (!Performans.parcacikSiniri) return;
		int toplam = particlesToAdd.size();
		for (ParticleGroup<?> g : particles.values()) {
			toplam += g.size();
		}
		if (toplam >= Performans.PARCACIK_EN_COK) ci.cancel();
	}
}
