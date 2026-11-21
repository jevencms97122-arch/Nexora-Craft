package fr.nexora.loading.mixin;

import fr.nexora.loading.LoadingSession;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** Chaque changement d'écran passe par LoadingSession pendant une connexion. */
@Mixin(Minecraft.class)
public abstract class MinecraftMixin {
    @ModifyVariable(method = "setScreen", at = @At("HEAD"), argsOnly = true)
    private Screen nexoraloading$filterScreen(Screen next) {
        return LoadingSession.filter((Minecraft) (Object) this, next);
    }
}
