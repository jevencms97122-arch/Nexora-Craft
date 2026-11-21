package fr.nexora.loading.mixin;

import fr.nexora.loading.LoadingRenderer;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * ConnectScreen n'a pas son propre fond : celui de Screen (panorama flouté) est remplacé par
 * lobby.png, net, en plein écran.
 */
@Mixin(Screen.class)
public abstract class ScreenMixin {
    @Inject(method = "renderBackground", at = @At("HEAD"), cancellable = true)
    private void nexoraloading$background(GuiGraphics g, int mouseX, int mouseY, float delta, CallbackInfo ci) {
        Screen self = (Screen) (Object) this;
        if (self instanceof ConnectScreen) {
            LoadingRenderer.renderBackground(g, self.width, self.height);
            ci.cancel();
        }
    }
}
