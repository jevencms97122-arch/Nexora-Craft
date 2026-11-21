package fr.nexora.loading;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;

/**
 * Écran de chargement de secours : affiché si Minecraft retire son écran avant que le monde soit
 * chargé, pour qu'on ne voie jamais le monde se construire. Il se retire seul quand le joueur est
 * dans le monde (ou après une minute, pour ne jamais bloquer le joueur).
 */
public class NexoraHoldScreen extends Screen {
    private static final long MAX_WAIT_MS = 60_000L;
    private final long openedAt = System.currentTimeMillis();

    public NexoraHoldScreen() {
        super(LoadingRenderer.TEXT);
    }

    @Override
    public void tick() {
        boolean ready = LoadingSession.worldReady(this.minecraft);
        boolean tooLong = System.currentTimeMillis() - openedAt > MAX_WAIT_MS && this.minecraft.player != null;
        if (ready || tooLong) {
            LoadingSession.end();
            this.minecraft.setScreen(null);
        }
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float delta) {
        LoadingRenderer.renderBackground(g, this.width, this.height);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float delta) {
        LoadingRenderer.renderProgress(g, this.font, this.width, this.height, LoadingSession.progress(0.95f));
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return false;
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
