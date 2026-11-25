package com.kcz.client.mixin;

import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import com.mojang.blaze3d.pipeline.RenderTarget;
import com.mojang.blaze3d.resource.CrossFrameResourcePool;

import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.GameRenderer;
import net.minecraft.client.renderer.LevelTargetBundle;
import net.minecraft.client.renderer.PostChain;
import net.minecraft.resources.Identifier;

import com.kcz.client.KczClient;
import com.kcz.client.Performans;

/**
 * Güçlü sistem: ekran efektleri (hareket bulanıklığı, kenar yumuşatma, renk, keskinleştirme).
 * Dünya çizildikten hemen sonra, arayüzden önce uygulanır (yazılar keskin kalır).
 * Oyunun kendi efekt sistemini kullanır; bir efekt yüklenemezse sadece o atlanır.
 */
@Mixin(GameRenderer.class)
public class PostEfektMixin {
	@Shadow @Final private RenderTarget mainRenderTarget;
	@Shadow @Final private CrossFrameResourcePool resourcePool;

	@Unique private static boolean kcz$hataVerdi = false;

	// 26.2'de renderLevel(DeltaTracker), 26.3'te renderLevel(): sadece ad ile hedeflenir
	@Inject(method = "render", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/GameRenderer;renderLevel", shift = At.Shift.AFTER))
	private void kcz$efektler(CallbackInfo ci) {
		if (kcz$hataVerdi) return;
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null || mc.player == null) return;
		if (Performans.efektBulanik) kcz$uygula(mc, Performans.EFEKT_BULANIK);
		if (Performans.efektKenar) kcz$uygula(mc, Performans.EFEKT_KENAR);
		if (Performans.efektRenk) kcz$uygula(mc, Performans.EFEKT_RENK);
		if (Performans.efektKeskin) kcz$uygula(mc, Performans.EFEKT_KESKIN);
	}

	@Unique
	private void kcz$uygula(Minecraft mc, Identifier id) {
		try {
			PostChain zincir = mc.getShaderManager().getPostChain(id, LevelTargetBundle.MAIN_TARGETS);
			if (zincir != null) zincir.process(mainRenderTarget, resourcePool);
		} catch (Throwable t) {
			// Bir daha denenmesin: her karede hata yazmasın
			kcz$hataVerdi = true;
			KczClient.LOG.warn("KCZ ekran efekti çalışmadı ({}): {}", id, t.toString());
		}
	}
}
