package fr.nexora.loading;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

import java.util.List;

/** Erreur de connexion : fond Nexora, message d'erreur et un bouton « Retour ». */
public class NexoraErrorScreen extends Screen {
    private final Screen parent;
    private final Component reason;
    private List<FormattedCharSequence> lines = List.of();

    public NexoraErrorScreen(Screen parent, Component title, Component reason) {
        super(title != null ? title : Component.literal("Connexion impossible"));
        this.parent = parent;
        this.reason = reason != null ? reason : Component.empty();
    }

    private int blockHeight() {
        return 20 + this.lines.size() * (this.font.lineHeight + 2) + 14 + 20;
    }

    private int top() {
        return Math.max(10, (this.height - blockHeight()) / 2);
    }

    @Override
    protected void init() {
        this.lines = this.font.split(this.reason, Math.min(360, this.width - 40));
        int buttonY = top() + blockHeight() - 20;
        this.addRenderableWidget(Button.builder(Component.literal("Retour"), b -> this.onClose())
                .bounds(this.width / 2 - 75, buttonY, 150, 20)
                .build());
    }

    @Override
    public void onClose() {
        this.minecraft.setScreen(this.parent != null ? this.parent : new TitleScreen());
    }

    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float delta) {
        LoadingRenderer.renderBackground(g, this.width, this.height);
        g.fill(0, 0, this.width, this.height, 0x99000000);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float delta) {
        int top = top();
        g.drawCenteredString(this.font, this.title, this.width / 2, top, 0xFFFF6B6B);
        int y = top + 20;
        for (FormattedCharSequence line : this.lines) {
            g.drawCenteredString(this.font, line, this.width / 2, y, 0xFFE6E6F0);
            y += this.font.lineHeight + 2;
        }
        super.render(g, mouseX, mouseY, delta);
    }
}
