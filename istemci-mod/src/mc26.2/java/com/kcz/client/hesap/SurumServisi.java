package com.kcz.client.hesap;

import com.mojang.authlib.minecraft.UserApiService;
import com.mojang.authlib.yggdrasil.FriendsService;
import com.mojang.authlib.yggdrasil.YggdrasilAuthenticationService;

import net.minecraft.client.Minecraft;
import net.minecraft.client.User;
import net.minecraft.client.gui.screens.social.PlayerSocialManager;
import net.minecraft.client.gui.screens.social.RemoteFriendListUpdateHandler;

import com.kcz.client.mixin.MinecraftHesapErisim;

/**
 * Minecraft 26.2 (authlib 9): hesaba bağlı servisler YggdrasilAuthenticationService ile kurulur
 * (oyunun kendi açılışındaki gibi). 26.3 sürümü src/mc26.3 içinde.
 */
public final class SurumServisi {
	private final YggdrasilAuthenticationService kesif;
	private final boolean cevrimdisi;
	private final String erisim;

	/** cevrimdisiHesap: isimle girilen (Microsoft'suz) hesap; servisler ağa gitmeden kurulur. */
	public SurumServisi(MinecraftHesapErisim e, User kullanici, boolean cevrimdisiHesap) {
		this.cevrimdisi = e.kcz$cevrimdisiGelistirici() || cevrimdisiHesap;
		this.kesif = cevrimdisi ? YggdrasilAuthenticationService.createOffline(e.kcz$vekil())
				: new YggdrasilAuthenticationService(e.kcz$vekil());
		this.erisim = kullanici.getAccessToken();
	}

	/** Ağ işi yapabilir: ana thread dışında çağrılır. */
	public UserApiService kullaniciApi() {
		return cevrimdisi ? UserApiService.OFFLINE : kesif.createUserApiService(erisim);
	}

	/** Mojang arkadaş listesi ve sosyal etkileşimler (ana thread). */
	public void sosyalKur(Minecraft mc, MinecraftHesapErisim e, UserApiService api) {
		RemoteFriendListUpdateHandler eski = e.kcz$arkadasGuncelleyiciAl();
		if (eski != null) {
			eski.close();
		}
		FriendsService arkadas = kesif.createFriendsService(erisim);
		RemoteFriendListUpdateHandler yeni = new RemoteFriendListUpdateHandler(arkadas, mc);
		e.kcz$arkadasGuncelleyiciYaz(yeni);
		PlayerSocialManager sosyal = new PlayerSocialManager(mc, api, arkadas, yeni);
		e.kcz$sosyalYaz(sosyal);
		if (sosyal.isFriendListEnabled()) {
			yeni.start();
		}
	}
}
