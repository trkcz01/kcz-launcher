package com.kcz.client.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import com.llamalad7.mixinextras.sugar.Local;

import net.minecraft.client.gui.components.PlayerTabOverlay;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.Component;

import com.kcz.client.KczOyunculari;

/** Tab listesinde KÇZ kullananların isminin önüne KÇZ simgesi (her sunucuda). */
@Mixin(PlayerTabOverlay.class)
public class TabSimgeMixin {
	@ModifyReturnValue(method = "getNameForDisplay", at = @At("RETURN"))
	private Component kcz$simge(Component ad, @Local(argsOnly = true) PlayerInfo oyuncu) {
		if (oyuncu == null || !KczOyunculari.kczMi(oyuncu.getProfile().name())) return ad;
		return Component.empty().append(KczOyunculari.SIMGE).append(" ").append(ad);
	}
}
