package fr.nexora.loading;

import net.fabricmc.api.ClientModInitializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class NexoraLoadingClient implements ClientModInitializer {
    public static final String MOD_ID = "nexoraloading";
    public static final Logger LOGGER = LoggerFactory.getLogger("Nexora Loading");

    @Override
    public void onInitializeClient() {
        LOGGER.info("Nexora Loading prêt : écrans de connexion remplacés");
    }
}
