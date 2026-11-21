package fr.nexora.loading;

import fr.nexora.loading.mixin.DisconnectedScreenAccessor;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.DisconnectedScreen;
import net.minecraft.client.gui.screens.LevelLoadingScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.SectionPos;
import net.minecraft.network.DisconnectionDetails;
import net.minecraft.network.chat.Component;

/**
 * Une connexion à un serveur, du clic sur « Rejoindre » jusqu'à l'entrée dans le monde.
 * Tant qu'elle est active, nos écrans remplacent ceux de Minecraft et aucun écran vide
 * (qui laisserait voir le monde en cours de chargement) n'est accepté.
 */
public final class LoadingSession {
    private static boolean active;
    private static long startedAt;
    /** Progression affichée (0..1), qui ne recule jamais pendant une connexion. */
    private static float shown;

    private LoadingSession() {}

    public static boolean isActive() {
        return active;
    }

    public static void start() {
        if (!active) {
            active = true;
            startedAt = System.currentTimeMillis();
            shown = 0f;
        }
    }

    public static void end() {
        active = false;
    }

    public static long elapsedMs() {
        return System.currentTimeMillis() - startedAt;
    }

    /**
     * Progression à afficher. Pendant la connexion (terrainProgress < 0) elle avance doucement
     * jusqu'à 35 % ; pendant le chargement du terrain elle suit la vraie progression de Minecraft
     * sur les 65 % restants.
     */
    public static float progress(float terrainProgress) {
        float target;
        if (terrainProgress < 0f) {
            float t = elapsedMs() / 1000f;
            target = 0.35f * (1f - (float) Math.exp(-t / 2.5f));
        } else {
            target = 0.35f + 0.65f * Math.min(1f, terrainProgress);
        }
        shown = Math.max(shown, shown + (target - shown) * 0.15f);
        return shown;
    }

    /** Le joueur est dans le monde et le terrain sous ses pieds est chargé. */
    public static boolean worldReady(Minecraft mc) {
        if (mc.level == null || mc.player == null || mc.getConnection() == null) {
            return false;
        }
        int cx = SectionPos.blockToSectionCoord(mc.player.getBlockX());
        int cz = SectionPos.blockToSectionCoord(mc.player.getBlockZ());
        return mc.level.hasChunk(cx, cz);
    }

    /** Appelé à chaque changement d'écran : décide de l'écran réellement affiché. */
    public static Screen filter(Minecraft mc, Screen next) {
        if (next instanceof ConnectScreen) {
            start();
            return next;
        }
        if (!active) {
            return next;
        }
        if (next instanceof DisconnectedScreen disconnected) {
            // Erreur de connexion : message d'erreur et bouton « Retour ».
            end();
            DisconnectedScreenAccessor acc = (DisconnectedScreenAccessor) disconnected;
            DisconnectionDetails details = acc.nexoraloading$getDetails();
            Component reason = details != null ? details.reason() : Component.empty();
            return new NexoraErrorScreen(acc.nexoraloading$getParent(), disconnected.getTitle(), reason);
        }
        if (next == null) {
            // L'écran de chargement du terrain se ferme quand le monde est prêt : c'est la fin.
            if (mc.screen instanceof LevelLoadingScreen || mc.screen instanceof NexoraHoldScreen || worldReady(mc)) {
                end();
                return null;
            }
            // Sinon le monde serait visible avant d'être chargé : on garde l'écran de chargement.
            return new NexoraHoldScreen();
        }
        if (next instanceof NexoraHoldScreen || next instanceof LevelLoadingScreen) {
            return next;
        }
        // Retour au menu sans erreur (connexion abandonnée) : la session s'arrête.
        if (mc.level == null && mc.getConnection() == null && !(mc.screen instanceof ConnectScreen)) {
            end();
        }
        return next;
    }
}
