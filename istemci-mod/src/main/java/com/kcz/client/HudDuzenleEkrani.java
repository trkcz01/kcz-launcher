package com.kcz.client;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

/** HUD'u düzenle: göstergeler fareyle sürüklenip ekranda istenen yere konur. */
public class HudDuzenleEkrani extends Screen {
	private final Screen onceki;
	private int surukle = -1;
	private double farkX, farkY;

	public HudDuzenleEkrani(Screen onceki) {
		super(Component.literal(Dil.t("HUD'u düzenle")));
		this.onceki = onceki;
	}

	@Override
	protected void init() {
		Hud.duzenleme = true;
		int y = this.height - 28;
		this.addRenderableWidget(Button.builder(Component.literal(Dil.t("Varsayılana döndür")), b -> {
			Ayar.get().hudKonum.clear();
			Ayar.kaydet();
		}).bounds(this.width / 2 - 124, y, 120, 20).build());
		this.addRenderableWidget(Button.builder(Component.literal(Dil.t("Bitti")), b -> onClose())
				.bounds(this.width / 2 + 4, y, 120, 20).build());
	}

	@Override
	public void onClose() {
		Hud.duzenleme = false;
		Ayar.kaydet();
		this.minecraft.gui.setScreen(this.onceki);
	}

	@Override
	public void removed() {
		Hud.duzenleme = false;
		super.removed();
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	/** Arka planı karartma: göstergeler olduğu gibi görünsün */
	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		g.fill(0, 0, this.width, this.height, 0x30000000);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		super.extractRenderState(g, mx, my, delta);
		int vurgu = Ayar.renk(Ayar.get().tema.vurgu, 0xFF, 0xFFA1A1AA);
		for (int i = 0; i < Hud.PARCALAR.length; i++) {
			int[] s = Hud.sinir[i];
			if (s[2] <= 0) continue;
			boolean ust = i == surukle || (mx >= s[0] && mx < s[0] + s[2] && my >= s[1] && my < s[1] + s[3]);
			g.outline(s[0] - 2, s[1] - 2, s[2] + 4, s[3] + 4, ust ? vurgu : 0x99FFFFFF);
			if (ust) g.text(this.font, Hud.PARCA_ADI[i], s[0], Math.max(0, s[1] - 12), vurgu, true);
		}
		String ipucu = Dil.t("Göstergeleri fareyle sürükleyip istediğin yere bırak");
		g.centeredText(this.font, ipucu, this.width / 2, this.height - 42, 0xFFF1F5F9);
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent e, boolean cift) {
		if (super.mouseClicked(e, cift)) return true;
		if (e.button() != 0) return false;
		for (int i = Hud.PARCALAR.length - 1; i >= 0; i--) {
			int[] s = Hud.sinir[i];
			if (s[2] > 0 && e.x() >= s[0] - 2 && e.x() < s[0] + s[2] + 2 && e.y() >= s[1] - 2 && e.y() < s[1] + s[3] + 2) {
				surukle = i;
				farkX = e.x() - s[0];
				farkY = e.y() - s[1];
				return true;
			}
		}
		return false;
	}

	@Override
	public boolean mouseDragged(MouseButtonEvent e, double dx, double dy) {
		if (surukle < 0) return super.mouseDragged(e, dx, dy);
		int[] s = Hud.sinir[surukle];
		double x = Math.max(0, Math.min(this.width - s[2], e.x() - farkX));
		double y = Math.max(0, Math.min(this.height - s[3], e.y() - farkY));
		Ayar.get().hudKonum.put(Hud.PARCALAR[surukle], new float[] { (float) (x / this.width), (float) (y / this.height) });
		return true;
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent e) {
		if (surukle >= 0) {
			surukle = -1;
			Ayar.kaydet();
			return true;
		}
		return super.mouseReleased(e);
	}
}
