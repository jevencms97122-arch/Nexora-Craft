package fr.nexora.loading.mixin;

import net.minecraft.client.gui.screens.DisconnectedScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.DisconnectionDetails;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

@Mixin(DisconnectedScreen.class)
public interface DisconnectedScreenAccessor {
    @Accessor("parent")
    Screen nexoraloading$getParent();

    @Accessor("details")
    DisconnectionDetails nexoraloading$getDetails();
}
