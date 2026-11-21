package fr.nexora.loading.mixin;

import fr.nexora.loading.LoadingRenderer;
import fr.nexora.loading.LoadingSession;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.LevelLoadingScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * « Chargement du terrain » pendant une connexion à un serveur : même écran que la connexion, la
 * barre suivant la vraie progression. En solo ou lors d'un changement de dimension, l'écran de
 * Minecraft reste inchangé.
 */
@Mixin(LevelLoadingScreen.class)
public abstract class LevelLoadingScreenMixin extends Screen {
    @Shadow
    private float smoothedProgress;

    protected LevelLoadingScreenMixin(Component title) {
        super(title);
    }

    @Inject(method = "renderBackground", at = @At("HEAD"), cancellable = true)
    private void nexoraloading$background(GuiGraphics g, int mouseX, int mouseY, float delta, CallbackInfo ci) {
        if (LoadingSession.isActive()) {
            LoadingRenderer.renderBackground(g, this.width, this.height);
            ci.cancel();
        }
    }

    @Inject(method = "render", at = @At("HEAD"), cancellable = true)
    private void nexoraloading$render(GuiGraphics g, int mouseX, int mouseY, float delta, CallbackInfo ci) {
        if (LoadingSession.isActive()) {
            LoadingRenderer.renderProgress(g, this.font, this.width, this.height, LoadingSession.progress(this.smoothedProgress));
            ci.cancel();
        }
    }
}
