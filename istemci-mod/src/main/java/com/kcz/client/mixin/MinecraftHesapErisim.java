package com.kcz.client.mixin;

import java.net.Proxy;
import java.util.concurrent.CompletableFuture;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Mutable;
import org.spongepowered.asm.mixin.gen.Accessor;

import com.mojang.authlib.minecraft.UserApiService;

import net.minecraft.client.Minecraft;
import net.minecraft.client.User;
import net.minecraft.client.gui.screens.social.PlayerSocialManager;
import net.minecraft.client.gui.screens.social.RemoteFriendListUpdateHandler;
import net.minecraft.client.multiplayer.ProfileKeyPairManager;
import net.minecraft.client.multiplayer.chat.report.ReportingContext;
import net.minecraft.client.telemetry.ClientTelemetryManager;

/**
 * Oyun içinde hesap değiştirme: Minecraft'ın hesaba bağlı (final) alanlarını yeniden kurmak için erişim.
 * Alan adları 26.2 ve 26.3'te aynı.
 */
@Mixin(Minecraft.class)
public interface MinecraftHesapErisim {
	@Mutable
	@Accessor("user")
	void kcz$kullaniciYaz(User u);

	@Mutable
	@Accessor("userApiService")
	void kcz$kullaniciApiYaz(UserApiService s);

	@Mutable
	@Accessor("userPropertiesFuture")
	void kcz$ozelliklerYaz(CompletableFuture<UserApiService.UserProperties> f);

	/** Tür 26.2'de yggdrasil.ProfileResult, 26.3'te services.ProfileResult: joker ile ikisine de uyar. */
	@Mutable
	@Accessor("profileFuture")
	void kcz$profilYaz(CompletableFuture<?> f);

	@Mutable
	@Accessor("playerSocialManager")
	void kcz$sosyalYaz(PlayerSocialManager m);

	@Accessor("remoteFriendListUpdateHandler")
	RemoteFriendListUpdateHandler kcz$arkadasGuncelleyiciAl();

	@Mutable
	@Accessor("remoteFriendListUpdateHandler")
	void kcz$arkadasGuncelleyiciYaz(RemoteFriendListUpdateHandler h);

	@Mutable
	@Accessor("telemetryManager")
	void kcz$telemetriYaz(ClientTelemetryManager t);

	@Mutable
	@Accessor("profileKeyPairManager")
	void kcz$anahtarlarYaz(ProfileKeyPairManager p);

	@Accessor("reportingContext")
	void kcz$raporlamaYaz(ReportingContext r);

	@Accessor("proxy")
	Proxy kcz$vekil();

	@Accessor("offlineDeveloperMode")
	boolean kcz$cevrimdisiGelistirici();
}
