package fr.nexora.loading.mixin;

import fr.nexora.loading.LoadingRenderer;
import fr.nexora.loading.LoadingSession;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/** « Connexion au serveur » : fond Nexora, barre de chargement, sans bouton Annuler ni Échap. */
@Mixin(ConnectScreen.class)
public abstract class ConnectScreenMixin extends Screen {
    protected ConnectScreenMixin(Component title) {
        super(title);
    }

    /** Le bouton « Annuler » est retiré dès qu'il est créé (et à chaque redimensionnement). */
    @Inject(method = "init", at = @At("TAIL"))
    private void nexoraloading$removeCancel(CallbackInfo ci) {
        this.clearWidgets();
    }

    @Inject(method = "shouldCloseOnEsc", at = @At("HEAD"), cancellable = true)
    private void nexoraloading$noEscape(CallbackInfoReturnable<Boolean> cir) {
        cir.setReturnValue(false);
    }

    @Inject(method = "render", at = @At("HEAD"), cancellable = true)
    private void nexoraloading$render(GuiGraphics g, int mouseX, int mouseY, float delta, CallbackInfo ci) {
        LoadingSession.start();
        LoadingRenderer.renderProgress(g, this.font, this.width, this.height, LoadingSession.progress(-1f));
        ci.cancel();
    }
}
